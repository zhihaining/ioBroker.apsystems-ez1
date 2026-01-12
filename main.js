"use strict";

const utils = require("@iobroker/adapter-core");
const { createClient } = require("./lib/api");
const nodemailer = require("nodemailer");

class ApsystemsEz1 extends utils.Adapter {
    constructor(options) {
        super({ ...options, name: "apsystems-ez1" });

        this.pollTimer = null;
        this.errorCounts = {};

        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
    }

    // -----------------------------
    // Utility: sanitize device names
    // -----------------------------
    nameToId(name) {
        const raw = (name || "").trim();
        const noForbidden = raw.replace(this.FORBIDDEN_CHARS, "_");
        return noForbidden.replace(/[^A-Za-z0-9_-]/g, "_");
    }

    // -----------------------------
    // Config helper
    // -----------------------------
    getConfig() {
        return this.config || this.native || {};
    }

    // -----------------------------
    // API client creation
    // -----------------------------
    getApiForDevice(dev) {
        const cfg = this.getConfig();

        const MAX_DELAY = 2_147_000_000;

        let timeout = Number(cfg.httpTimeout || 5000);
        if (!Number.isFinite(timeout) || timeout <= 0) timeout = 5000;
        if (timeout > MAX_DELAY) timeout = MAX_DELAY;

        let retries = Number(cfg.httpRetries || 2);
        if (!Number.isFinite(retries) || retries < 0) retries = 2;

        return createClient({
            ip: dev.ip,
            port: cfg.port || 8050,
            timeout,
            retries
        });
    }

    // -----------------------------
    // HTTP wrappers with error tracking
    // -----------------------------
    async safeGet(api, path, label) {
        try {
            const res = await api.get(path);
            if (label) this.errorCounts[label] = 0;
            return res;
        } catch (err) {
            const key = label || path;
            this.errorCounts[key] = (this.errorCounts[key] || 0) + 1;

            this.log.warn(`HTTP ${path} failed (${api.baseURL}): ${err.message}`);

            const cfg = this.getConfig();
            const threshold = Number(cfg.httpRetries || 2) + 1;

            if (this.errorCounts[key] >= threshold) {
                this.log.error(`Persistent error for ${key}: ${err.message}`);
                this.sendAlert(`APsystems EZ1 persistent error for ${key}: ${err.message}`);
                this.errorCounts[key] = 0;
            }
            return null;
        }
    }

    async normalGet(api, path, label) {
        try {
            const res = await api.get(path);
            if (label) this.errorCounts[label] = 0;
            return res;
        } catch (err) {
            const key = label || path;
            this.errorCounts[key] = (this.errorCounts[key] || 0) + 1;

            const cfg = this.getConfig();
            const threshold = Number(cfg.httpRetries || 2) + 1;

            if (this.errorCounts[key] >= threshold) {
                this.errorCounts[key] = 0;
            }
            return null;
        }
    }

    // -----------------------------
    // Email alert
    // -----------------------------
    sendAlert(message) {
        const cfg = this.getConfig();
        if (!cfg.alertEmail) return;

        try {
            const transporter = nodemailer.createTransport({ sendmail: true });
            transporter.sendMail(
                {
                    from: "iobroker-apsystems-ez1@localhost",
                    to: cfg.alertEmail,
                    subject: "APsystems EZ1 Adapter Alert",
                    text: message
                },
                err => {
                    if (err) this.log.error("Alert email send failed: " + err);
                }
            );
        } catch (e) {
            this.log.error("sendAlert exception: " + e);
        }
    }

    // -----------------------------
    // Create device hierarchy
    // -----------------------------
    async createDeviceHierarchy(devId) {
        await this.setObjectNotExistsAsync("devices", {
            type: "folder",
            common: { name: "Devices" },
            native: {}
        });

        await this.setObjectNotExistsAsync(`devices.${devId}`, {
            type: "device",
            common: { name: devId },
            native: {}
        });

        for (const ch of ["output", "control", "alarm"]) {
            await this.setObjectNotExistsAsync(`devices.${devId}.${ch}`, {
                type: "channel",
                common: { name: ch },
                native: {}
            });
        }
    }

    // -----------------------------
    // Create states for a device
    // -----------------------------
    async createStatesForDevice(devId) {
        const base = `devices.${devId}`;

        const states = [
            ["deviceId", "Device ID", "string", "text", false],
            ["devVer", "Device Version", "string", "text", false],
            ["ssid", "SSID", "string", "text", false],
            ["ipAddr", "IP Address", "string", "info.ip", false],

            ["minPower", "Min Power (W)", "number", "value.power", false],
            ["maxPower", "Max Power (W)", "number", "value.power", false],

            ["output.p1", "Power P1 (W)", "number", "value.power", false],
            ["output.p2", "Power P2 (W)", "number", "value.power", false],
            ["output.p", "Power P (W)", "number", "value.power", false],

            ["output.e1", "Energy E1 (kWh)", "number", "value.energy", false],
            ["output.e2", "Energy E2 (kWh)", "number", "value.energy", false],
            ["output.e", "Energy E (kWh)", "number", "value.energy", false],

            ["output.te1", "Lifetime TE1 (kWh)", "number", "value.energy", false],
            ["output.te2", "Lifetime TE2 (kWh)", "number", "value.energy", false],

            ["control.maxPower", "Control: Max Power (W)", "number", "level.power", true],
            ["control.onOff", "Control: On/Off", "boolean", "switch", true],

            ["alarm.og", "Alarm: Off Grid", "boolean", "indicator.alarm", false],
            ["alarm.isce1", "Alarm: DC1 Short Circuit", "boolean", "indicator.alarm", false],
            ["alarm.isce2", "Alarm: DC2 Short Circuit", "boolean", "indicator.alarm", false],
            ["alarm.oe", "Alarm: Output Fault", "boolean", "indicator.alarm", false]
        ];

        for (const [id, name, type, role, write] of states) {
            await this.setObjectNotExistsAsync(`${base}.${id}`, {
                type: "state",
                common: {
                    name,
                    type,
                    role,
                    read: !write,
                    write
                },
                native: {}
            });
        }
    }

    // -----------------------------
    // Update states
    // -----------------------------
    async updateStatesForDevice(devId, info, output, maxp, alarm, onoff) {
        const base = `devices.${devId}`;

        try {
            if (info?.data) {
                const d = info.data;
                this.setState(`${base}.deviceId`, d.deviceId || "", true);
                this.setState(`${base}.devVer`, d.devVer || "", true);
                this.setState(`${base}.ssid`, d.ssid || "", true);
                this.setState(`${base}.ipAddr`, d.ipAddr || "", true);
                this.setState(`${base}.minPower`, Number(d.minPower || 0), true);
                this.setState(`${base}.maxPower`, Number(d.maxPower || 0), true);
            }

            if (output?.data) {
                const d = output.data;
                this.setState(`${base}.output.p1`, Number(d.p1 || 0), true);
                this.setState(`${base}.output.p2`, Number(d.p2 || 0), true);
                this.setState(`${base}.output.p`, Number(d.p1 || 0) + Number(d.p2 || 0), true);
                this.setState(`${base}.output.e1`, Number(d.e1 || 0), true);
                this.setState(`${base}.output.e2`, Number(d.e2 || 0), true);
                this.setState(`${base}.output.e`, Number(d.e1 || 0) + Number(d.e2 || 0), true);
                this.setState(`${base}.output.te1`, Number(d.te1 || 0), true);
                this.setState(`${base}.output.te2`, Number(d.te2 || 0), true);
            }

            if (maxp?.data) {
                this.setState(`${base}.control.maxPower`, Number(maxp.data.maxPower || 0), true);
            }

            if (alarm?.data) {
                const a = alarm.data;
                this.setState(`${base}.alarm.og`, !!a.og, true);
                this.setState(`${base}.alarm.isce1`, !!a.isce1, true);
                this.setState(`${base}.alarm.isce2`, !!a.isce2, true);
                this.setState(`${base}.alarm.oe`, !!a.oe, true);
            }

            if (onoff?.data) {
                this.setState(`${base}.control.onOff`, onoff.data.status === 0, true);
            }
        } catch (e) {
            this.log.error("updateStatesForDevice error: " + e);
        }
    }

    // -----------------------------
    // Polling
    // -----------------------------
    async pollDevice(dev) {
        const api = this.getApiForDevice(dev);
        const devId = this.nameToId(dev.name);

        const info = await this.normalGet(api, "/getDeviceInfo", `${devId}_info`);

        if (!info) {
            await this.updateStatesForDevice(devId, null, null, null, null, null);
            return;
        }

        const output = await this.safeGet(api, "/getOutputData", `${devId}_output`);
        const maxp = await this.safeGet(api, "/getMaxPower", `${devId}_maxp`);
        const alarm = await this.safeGet(api, "/getAlarm", `${devId}_alarm`);
        const onoff = await this.safeGet(api, "/getOnOff", `${devId}_onoff`);

        await this.updateStatesForDevice(devId, info, output, maxp, alarm, onoff);
    }

    // -----------------------------
    // onReady
    // -----------------------------
    async onReady() {
        this.setState("info.connection", false, true);

        const cfg = this.getConfig();
        let devices = [];

        if (Array.isArray(cfg.devices) && cfg.devices.length) {
            devices = cfg.devices.map(d => ({
                name: d.name || d.ip,
                ip: d.ip
            }));
        }

        // Create hierarchy + states
        for (const dev of devices) {
            const devId = this.nameToId(dev.name);
            await this.createDeviceHierarchy(devId);
            await this.createStatesForDevice(devId);
        }

        // Subscribe control states
        this.subscribeStates("devices.*.control.*");

        // Poll interval
        const MAX_DELAY = 2_147_000_000;
        let interval = Number(cfg.pollInterval || 30) * 1000;
        if (!Number.isFinite(interval) || interval <= 0) interval = 30000;
        if (interval > MAX_DELAY) interval = MAX_DELAY;

        // Initial poll
        for (const dev of devices) {
            await this.pollDevice(dev);
        }

        // Start interval
        this.pollTimer = this.setInterval(() => {
            for (const dev of devices) {
                this.pollDevice(dev);
            }
        }, interval);

        this.setState("info.connection", true, true);
    }

    // -----------------------------
    // Control handling
    // -----------------------------
    async onStateChange(id, state) {
        if (!state || state.ack) return;

        const parts = id.split(".");
        const idx = parts.indexOf("devices");
        if (idx === -1 || parts.length < idx + 4) return;

        const devId = parts[idx + 1];
        const controlPath = parts.slice(idx + 2).join(".");

        const cfg = this.getConfig();
        const dev = cfg.devices.find(d => this.nameToId(d.name || d.ip) === devId);
        if (!dev) return;

        const api = this.getApiForDevice(dev);

        if (controlPath === "control.maxPower") {
            try {
                await api.get(`/setMaxPower?p=${encodeURIComponent(state.val)}`);
                this.setState(id, state.val, true);
            } catch (e) {
                this.log.error("setMaxPower error: " + e);
            }
        }

        if (controlPath === "control.onOff") {
            try {
                const status = state.val ? 0 : 1;
                await api.get(`/setOnOff?status=${status}`);
                this.setState(id, state.val, true);
            } catch (e) {
                this.log.error("setOnOff error: " + e);
            }
        }
    }

    // -----------------------------
    // onUnload
    // -----------------------------
    onUnload(callback) {
        try {
            if (this.pollTimer) this.clearInterval(this.pollTimer);
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new ApsystemsEz1(options);
} else {
    new ApsystemsEz1();
}
