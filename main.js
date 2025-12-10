"use strict";

/*
 * Created with @iobroker/create-adapter v3.1.2
 */

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

    getConfig() {
        return this.config || this.native || {};
    }

    getApiForDevice(dev) {
        const cfg = this.getConfig();
        const timeout = Number(cfg.httpTimeout || 5000);
        const retries = Number(cfg.httpRetries || 2);
        return createClient({
            ip: dev.ip || cfg.deviceIp || "192.168.178.25",
            port: cfg.port || 8050,
            timeout,
            retries
        });
    }

    async safeGet(api, path, label) {
        try {
            const res = await api.get(path);
            if (label) this.errorCounts[label] = 0;
            return res;
        } catch (err) {
            const key = label || path;
            this.errorCounts[key] = (this.errorCounts[key] || 0) + 1;
            this.log.warn(`HTTP ${path} failed for ${api && api.baseURL ? api.baseURL : ""}: ${err.message || err}`);
            const cfg = this.getConfig();
            const threshold = Number(cfg.httpRetries || 2) + 1;
            if (this.errorCounts[key] >= threshold) {
                this.log.error(`Persistent error for ${key}: ${err.message || err}`);
                this.sendAlert(`APsystems EZ1 persistent error for ${key}: ${err.message || err}`);
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

    sendAlert(message) {
        const cfg = this.getConfig();
        const mail = cfg.alertEmail || "";
        if (!mail) return;
        try {
            const transporter = nodemailer.createTransport({ sendmail: true });
            transporter.sendMail(
                {
                    from: "iobroker-apsystems-ez1@localhost",
                    to: mail,
                    subject: "APsystems EZ1 Adapter Alert",
                    text: message
                },
                (err) => {
                    if (err) this.log.error("Alert email send failed: " + err);
                    else this.log.info("Alert email sent");
                }
            );
        } catch (e) {
            this.log.error("sendAlert exception: " + e);
        }
    }

    async createStatesForDevice(prefix) {
        const base = `${this.namespace}.${prefix}`;
        const states = [
            ["deviceId", "Device ID", "string", "info", {}],
            ["devVer", "Device Version", "string", "info", {}],
            ["ssid", "SSID", "string", "info", {}],
            ["ipAddr", "IP Address", "string", "info", {}],
            ["minPower", "Min Power (W)", "number", "value", { unit: "W" }],
            ["maxPower", "Max Power (W)", "number", "value", { unit: "W" }],
            ["output.p1", "Power P1 (W)", "number", "value.power", { unit: "W" }],
            ["output.p2", "Power P2 (W)", "number", "value.power", { unit: "W" }],
            ["output.p", "Power P (W)", "number", "value.power", { unit: "W" }],
            ["output.e1", "Energy E1 (kWh)", "number", "value.energy", { unit: "kWh" }],
            ["output.e2", "Energy E2 (kWh)", "number", "value.energy", { unit: "kWh" }],
            ["output.e", "Energy E (kWh)", "number", "value.energy", { unit: "kWh" }],
            ["output.te1", "Lifetime TE1 (kWh)", "number", "value.energy", { unit: "kWh" }],
            ["output.te2", "Lifetime TE2 (kWh)", "number", "value.energy", { unit: "kWh" }],
            ["control.maxPower", "Control: Max Power (W)", "number", "level", { unit: "W", write: true }],
            ["control.onOff", "Control: On/Off (0=On,1=Off)", "number", "switch", { write: true }],
            ["alarm.og", "Alarm: Off Grid", "number", "indicator", {}],
            ["alarm.isce1", "Alarm: DC1 Short Circuit", "number", "indicator", {}],
            ["alarm.isce2", "Alarm: DC2 Short Circuit", "number", "indicator", {}],
            ["alarm.oe", "Alarm: Output Fault", "number", "indicator", {}]
        ];
        for (const s of states) {
            const id = `${base}.${s[0]}`;
            const common = { name: s[1], type: s[2], role: s[3], read: true };
            if (s[4].write) common.write = true;
            if (s[4].unit) common.unit = s[4].unit;
            await this.setObjectNotExistsAsync(id, { type: "state", common, native: {} });
        }
    }

    async updateStatesForDevice(prefix, info, output, maxp, alarm, onoff) {
        const base = `${this.namespace}.devices.${prefix}`;
        try {
            if (info && info.data) {
                const d = info.data;
                this.setState(`${base}.deviceId`, { val: d.deviceId || "", ack: true });
                this.setState(`${base}.devVer`, { val: d.devVer || "", ack: true });
                this.setState(`${base}.ssid`, { val: d.ssid || "", ack: true });
                this.setState(`${base}.ipAddr`, { val: d.ipAddr || "", ack: true });
                this.setState(`${base}.minPower`, { val: Number(d.minPower || 0), ack: true });
                this.setState(`${base}.maxPower`, { val: Number(d.maxPower || 0), ack: true });
            }
            if (output && output.data) {
                const d = output.data;
                this.setState(`${base}.output.p1`, { val: Number(d.p1 || 0), ack: true });
                this.setState(`${base}.output.p2`, { val: Number(d.p2 || 0), ack: true });
                this.setState(`${base}.output.p`, { val: Number(d.p1 || 0) + Number(d.p2 || 0), ack: true });
                this.setState(`${base}.output.e1`, { val: Number(d.e1 || 0), ack: true });
                this.setState(`${base}.output.e2`, { val: Number(d.e2 || 0), ack: true });
                this.setState(`${base}.output.e`, { val: Number(d.e1 || 0) + Number(d.e2 || 0), ack: true });
                this.setState(`${base}.output.te1`, { val: Number(d.te1 || 0), ack: true });
                this.setState(`${base}.output.te2`, { val: Number(d.te2 || 0), ack: true });
            }
            if (maxp && maxp.data) {
                this.setState(`${base}.control.maxPower`, { val: Number(maxp.data.maxPower || 0), ack: true });
            }
            if (alarm && alarm.data) {
                this.setState(`${base}.alarm.og`, { val: Number(alarm.data.og || 0), ack: true });
                this.setState(`${base}.alarm.isce1`, { val: Number(alarm.data.isce1 || 0), ack: true });
                this.setState(`${base}.alarm.isce2`, { val: Number(alarm.data.isce2 || 0), ack: true });
                this.setState(`${base}.alarm.oe`, { val: Number(alarm.data.oe || 0), ack: true });
            }
            if (onoff && onoff.data) {
                this.setState(`${base}.control.onOff`, { val: Number(onoff.data.status || 1), ack: true });
            }
        } catch (e) {
            this.log.error("updateStatesForDevice error: " + e);
        }
    }

    async pollDevice(dev) {
        const api = this.getApiForDevice(dev);
        const info = await this.normalGet(api, "/getDeviceInfo", `${dev.name}_getDeviceInfo`);
        if (info == null) {
            await this.updateStatesForDevice(dev.name, null, null, null, null, null);
        } else {
            const output = await this.safeGet(api, "/getOutputData", `${dev.name}_getOutputData`);
            const maxp = await this.safeGet(api, "/getMaxPower", `${dev.name}_getMaxPower`);
            const alarm = await this.safeGet(api, "/getAlarm", `${dev.name}_getAlarm`);
            const onoff = await this.safeGet(api, "/getOnOff", `${dev.name}_getOnOff`);
            await this.updateStatesForDevice(dev.name, info, output, maxp, alarm, onoff);
        }
    }

    async onReady() {
        this.setState("info.connection", false, true);
        this.log.info("APsystems EZ1 adapter ready");

        const cfg = this.getConfig();
        let devices = [];
        if (Array.isArray(cfg.devices) && cfg.devices.length) {
            devices = cfg.devices.map(d => ({ name: d.name || d.ip, ip: d.ip }));
        } else if (cfg.deviceIp) {
            devices = [{ name: "EZ1", ip: cfg.deviceIp }];
        } else {
            devices = [{ name: "EZ1", ip: "192.168.178.25" }];
        }

        for (const dev of devices) {
            await this.createStatesForDevice(`devices.${dev.name}`);
        }

        // Subscribe control states
        this.subscribeStates(`${this.namespace}.*.control.*`);

        // Initial poll and start interval
        const interval = Number(cfg.pollInterval || 30) * 1000;
        for (const dev of devices) {
            await this.pollDevice(dev);
        }
        this.pollTimer = setInterval(async () => {
            for (const dev of devices) {
                await this.pollDevice(dev);
            }
        }, interval);

        // Mark connection true after initial setup
        this.setState("info.connection", true, true);
    }

    async onStateChange(id, state) {
        if (!state || state.ack) return;
        this.log.info(`stateChange ${id} => ${state.val}`);

        const parts = id.split(".");
        const idx = parts.indexOf("devices");
        if (idx === -1 || parts.length < idx + 4) return;

        const devName = parts[idx + 1];
        const controlPath = parts.slice(idx + 2).join(".");

        // Resolve device IP from config
        const cfg = this.getConfig();
        const devs = Array.isArray(cfg.devices) && cfg.devices.length
            ? cfg.devices.map(d => ({ name: d.name || d.ip, ip: d.ip }))
            : (cfg.deviceIp ? [{ name: "EZ1", ip: cfg.deviceIp }] : [{ name: devName, ip: "192.168.178.25" }]);
        const dev = devs.find(d => d.name === devName) || { name: devName, ip: cfg.deviceIp || "192.168.178.25" };

        const api = this.getApiForDevice(dev);

        if (controlPath === "control.maxPower") {
            try {
                await api.get(`/setMaxPower?p=${encodeURIComponent(state.val)}`);
                this.log.info(`Set maxPower ${state.val} for ${devName}`);
                this.setState(id, { val: state.val, ack: true });
            } catch (e) {
                this.log.error("setMaxPower error: " + e);
            }
        } else if (controlPath === "control.onOff") {
            try {
                await api.get(`/setOnOff?status=${encodeURIComponent(state.val)}`);
                this.log.info(`Set onOff ${state.val} for ${devName}`);
                this.setState(id, { val: state.val, ack: true });
            } catch (e) {
                this.log.error("setOnOff error: " + e);
            }
        }
    }

    onUnload(callback) {
        try {
            if (this.pollTimer) clearInterval(this.pollTimer);
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
