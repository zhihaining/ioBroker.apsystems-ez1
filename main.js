'use strict';

const utils = require('@iobroker/adapter-core');
const { createClient } = require('./lib/api');
const nodemailer = require('nodemailer');

let adapter = null;
let pollTimer = null;
const errorCounts = {};

function startAdapter(options) {
    options = options || {};
    adapter = new utils.Adapter(Object.assign({}, options, { name: 'apsystems-ez1' }));
    adapter.on('ready', onReady);
    adapter.on('stateChange', onStateChange);
    adapter.on('unload', onUnload);
    return adapter;
}

function getConfig() {
    return adapter.config || adapter.native || {};
}

function getApiForDevice(dev) {
    const cfg = getConfig();
    const timeout = Number(cfg.httpTimeout || 5000);
    const retries = Number(cfg.httpRetries || 2);
    return createClient({ ip: dev.ip, port: cfg.port || 8050, timeout, retries });
}

async function safeGet(api, path, label) {
    try {
        const res = await api.get(path);
        if (label) errorCounts[label] = 0;
        return res;
    } catch (err) {
        const key = label || path;
        errorCounts[key] = (errorCounts[key] || 0) + 1;
        adapter.log.warn(`HTTP ${path} failed for ${api && api.baseURL ? api.baseURL : ''}: ${err.message || err}`);
        const threshold = Number(adapter.config && adapter.config.httpRetries ? adapter.config.httpRetries : adapter.native && adapter.native.httpRetries ? adapter.native.httpRetries : 2) + 1;
        if (errorCounts[key] >= threshold) {
            adapter.log.error(`Persistent error for ${key}: ${err.message || err}`);
            sendAlert(`APsystems EZ1 persistent error for ${key}: ${err.message || err}`);
            errorCounts[key] = 0;
        }
        return null;
    }
}

function sendAlert(message) {
    const cfg = getConfig();
    const mail = cfg.alertEmail || '';
    if (!mail) return;
    try {
        const transporter = nodemailer.createTransport({ sendmail: true });
        transporter.sendMail({
            from: 'iobroker-apsystems-ez1@localhost',
            to: mail,
            subject: 'APsystems EZ1 Adapter Alert',
            text: message
        }, (err, info) => {
            if (err) adapter.log.error('Alert email send failed: ' + err);
            else adapter.log.info('Alert email sent');
        });
    } catch (e) {
        adapter.log.error('sendAlert exception: ' + e);
    }
}

async function createStatesForDevice(prefix) {
    const base = `apsystems-ez1.0.${prefix}`;
    const states = [
        ['deviceId','Device ID','string','info',{}],
        ['devVer','Device Version','string','info',{}],
        ['ssid','SSID','string','info',{}],
        ['ipAddr','IP Address','string','info',{}],
        ['minPower','Min Power (W)','number','value',{unit:'W'}],
        ['maxPower','Max Power (W)','number','value',{unit:'W'}],
        ['output.p1','Power P1 (W)','number','value.power',{unit:'W'}],
        ['output.p2','Power P2 (W)','number','value.power',{unit:'W'}],
        ['output.e1','Energy E1 (kWh)','number','value.energy',{unit:'kWh'}],
        ['output.e2','Energy E2 (kWh)','number','value.energy',{unit:'kWh'}],
        ['output.te1','Lifetime TE1 (kWh)','number','value.energy',{unit:'kWh'}],
        ['output.te2','Lifetime TE2 (kWh)','number','value.energy',{unit:'kWh'}],
        ['control.maxPower','Control: Max Power (W)','number','level',{unit:'W', write: True}],
        ['control.onOff','Control: On/Off (0=On,1=Off)','number','switch',{write: True}],
        ['alarm.og','Alarm: Off Grid','number','indicator',{}],
        ['alarm.isce1','Alarm: DC1 Short Circuit','number','indicator',{}],
        ['alarm.isce2','Alarm: DC2 Short Circuit','number','indicator',{}],
        ['alarm.oe','Alarm: Output Fault','number','indicator',{}]
    ];
    for (const s of states) {
        const id = `${base}.${s[0]}`;
        const common = { name: s[1], type: s[2], role: s[3], read: true };
        if (s[4].write) common.write = true;
        if (s[4].unit) common.unit = s[4].unit;
        await new Promise(resolve => adapter.setObjectNotExists(id, { type: 'state', common }, () => resolve()));
    }
}

async function updateStatesForDevice(prefix, info, output, maxp, alarm, onoff) {
    const base = `apsystems-ez1.0.${prefix}`;
    try {
        if (info && info.data) {
            const d = info.data;
            adapter.setState(`${base}.deviceId`, { val: d.deviceId || '', ack: true });
            adapter.setState(`${base}.devVer`, { val: d.devVer || '', ack: true });
            adapter.setState(`${base}.ssid`, { val: d.ssid || '', ack: true });
            adapter.setState(`${base}.ipAddr`, { val: d.ipAddr || '', ack: true });
            adapter.setState(`${base}.minPower`, { val: Number(d.minPower || 0), ack: true });
            adapter.setState(`${base}.maxPower`, { val: Number(d.maxPower || 0), ack: true });
        }
        if (output && output.data) {
            const d = output.data;
            adapter.setState(`${base}.output.p1`, { val: Number(d.p1 || 0), ack: true });
            adapter.setState(`${base}.output.p2`, { val: Number(d.p2 || 0), ack: true });
            adapter.setState(`${base}.output.e1`, { val: Number(d.e1 || 0), ack: true });
            adapter.setState(`${base}.output.e2`, { val: Number(d.e2 || 0), ack: true });
            adapter.setState(`${base}.output.te1`, { val: Number(d.te1 || 0), ack: true });
            adapter.setState(`${base}.output.te2`, { val: Number(d.te2 || 0), ack: true });
        }
        if (maxp && maxp.data) {
            adapter.setState(`${base}.control.maxPower`, { val: Number(maxp.data.maxPower || 0), ack: true });
        }
        if (alarm && alarm.data) {
            adapter.setState(`${base}.alarm.og`, { val: Number(alarm.data.og || 0), ack: true });
            adapter.setState(`${base}.alarm.isce1`, { val: Number(alarm.data.isce1 || 0), ack: true });
            adapter.setState(`${base}.alarm.isce2`, { val: Number(alarm.data.isce2 || 0), ack: true });
            adapter.setState(`${base}.alarm.oe`, { val: Number(alarm.data.oe || 0), ack: true });
        }
        if (onoff && onoff.data) {
            adapter.setState(`${base}.control.onOff`, { val: Number(onoff.data.status || 0), ack: true });
        }
    } catch (e) {
        adapter.log.error('updateStatesForDevice error: ' + e);
    }
}

async function pollDevice(dev) {
    const api = getApiForDevice(dev);
    const info = await safeGet(api, '/getDeviceInfo', `${dev.name}_getDeviceInfo`);
    const output = await safeGet(api, '/getOutputData', `${dev.name}_getOutputData`);
    const maxp = await safeGet(api, '/getMaxPower', `${dev.name}_getMaxPower`);
    const alarm = await safeGet(api, '/getAlarm', `${dev.name}_getAlarm`);
    const onoff = await safeGet(api, '/getOnOff', `${dev.name}_getOnOff`);

    await updateStatesForDevice(dev.name, info, output, maxp, alarm, onoff);
}

async function onReady() {
    adapter.log.info('APsystems EZ1 adapter ready');
    const cfg = getConfig();
    let devices = [];
    if (Array.isArray(cfg.devices) && cfg.devices.length) {
        devices = cfg.devices.map(d => ({ name: d.name || d.ip, ip: d.ip }));
    } else if (cfg.deviceIp) {
        devices = [{ name: 'EZ1', ip: cfg.deviceIp }];
    } else {
        devices = [{ name: 'EZ1', ip: '192.168.1.50' }];
    }
    for (const dev of devices) {
        await createStatesForDevice(`devices.${dev.name}`);
    }
    adapter.subscribeStates('apsystems-ez1.0.*.control.*');
    const interval = Number(cfg.pollInterval || 30) * 1000;
    for (const dev of devices) {
        await pollDevice(dev);
    }
    pollTimer = setInterval(async () => {
        for (const dev of devices) {
            await pollDevice(dev);
        }
    }, interval);
}

async function onStateChange(id, state) {
    if (!state || state.ack) return;
    adapter.log.info(`stateChange ${id} => ${state.val}`);
    const parts = id.split('.');
    const idx = parts.indexOf('devices');
    if (idx === -1 || parts.length < idx + 4) return;
    const devName = parts[idx+1];
    const control = parts.slice(idx+2).join('.');
    const cfg = getConfig();
    const devs = Array.isArray(cfg.devices) && cfg.devices.length ? cfg.devices : (cfg.deviceIp ? [{name:'EZ1', ip:cfg.deviceIp}] : []);
    const dev = devs.find(d => (d.name||d.ip) == devName);
    if (!dev) return;
    const api = getApiForDevice({ name: devName, ip: dev.ip });
    if (control === 'control.maxPower') {
        try {
            await api.get(`/setMaxPower?p=${encodeURIComponent(state.val)}`);
            adapter.log.info(`Set maxPower ${state.val} for ${devName}`);
            adapter.setState(id, { val: state.val, ack: true });
        } catch (e) {
            adapter.log.error('setMaxPower error: ' + e);
        }
    } else if (control === 'control.onOff') {
        try {
            await api.get(`/setOnOff?status=${encodeURIComponent(state.val)}`);
            adapter.log.info(`Set onOff ${state.val} for ${devName}`);
            adapter.setState(id, { val: state.val, ack: true });
        } catch (e) {
            adapter.log.error('setOnOff error: ' + e);
        }
    }
}

function onUnload(callback) {
    try {
        if (pollTimer) clearInterval(pollTimer);
        callback();
    } catch (e) {
        callback();
    }
}

if (module.parent) {
    module.exports = startAdapter;
} else {
    startAdapter();
}
