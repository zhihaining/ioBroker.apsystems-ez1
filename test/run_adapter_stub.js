// Simple runner that stubs @iobroker/adapter-core to allow exercising main.js
const Module = require('module');
const origLoad = Module._load;
Module._load = function(request) {
    if (request === '@iobroker/adapter-core') {
        const EventEmitter = require('events');
        return {
            Adapter: class extends EventEmitter {
                constructor(options) {
                    super();
                    this._options = options;
                    this.log = { error: console.error, warn: console.warn, info: console.log };
                    // provide no-op implementations for used timer functions
                    this.setInterval = setInterval.bind(global);
                    this.clearInterval = clearInterval.bind(global);
                }

                // default stubs for methods used in tests, will be overridden as needed
                async setObjectNotExistsAsync() { return {}; }
                setState() {}
            }
        };
    }
    return origLoad.apply(this, arguments);
};

const createApsystemsEz1 = require('../main');
(async () => {
    const adapter = createApsystemsEz1({});
    const objects = {};
    const states = {};
    adapter.setObjectNotExistsAsync = async (id, obj) => { objects[id] = obj; return obj; };
    adapter.setState = (id, val, ack) => { states[id] = { val, ack }; };

    await adapter.createStatesForDevice('testdev');
    console.log('created object keys:', Object.keys(objects).slice(0,20));

    const info = { data: { deviceId: 'D1', devVer: '1.2', ssid: 'myssid', ipAddr: '192.0.2.1', minPower: 5, maxPower: 100 } };
    const output = { data: { p1: 10, p2: 20, e1: 1.5, e2: 2.5, te1: 100, te2: 200 } };
    const maxp = { data: { maxPower: 42 } };
    const alarm = { data: { og: true, isce1: false, isce2: 1, oe: 0 } };
    const onoff = { data: { status: 0 } };

    await adapter.updateStatesForDevice('testdev', info, output, maxp, alarm, onoff);
    console.log('state samples:', {
        deviceId: states['devices.testdev.deviceId'],
        output_p: states['devices.testdev.output.p'],
        maxPower: states['devices.testdev.control.maxPower'],
        alarm_og: states['devices.testdev.alarm.og'],
        onOff: states['devices.testdev.control.onOff'],
    });
})();
