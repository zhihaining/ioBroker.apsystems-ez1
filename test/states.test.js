"use strict";

const { expect } = require("chai");
const ApsystemsEz1 = require("../main");

describe("State creation and update", () => {
    it("creates states with correct roles and read/write flags and updates values correctly", async () => {
        const adapter = new ApsystemsEz1({});

        const objects = {};
        const states = {};

        adapter.setObjectNotExistsAsync = async (id, obj) => {
            objects[id] = obj;
            return obj;
        };

        adapter.setState = (id, val, ack) => {
            states[id] = { val, ack };
        };

        await adapter.createStatesForDevice("testdev");

        // Check some important objects
        expect(objects["devices.testdev.deviceId"].common.role).to.equal("info.serial");
        expect(objects["devices.testdev.control.maxPower"].common.write).to.equal(true);
        expect(objects["devices.testdev.control.onOff"].common.type).to.equal("boolean");
        expect(objects["devices.testdev.alarm.og"].common.role).to.equal("indicator.alarm");
        expect(objects["devices.testdev.output.p"].common.read).to.equal(true);

        // Simulate updates
        const info = { data: { deviceId: "D1", devVer: "1.2", ssid: "myssid", ipAddr: "192.0.2.1", minPower: 5, maxPower: 100 } };
        const output = { data: { p1: 10, p2: 20, e1: 1.5, e2: 2.5, te1: 100, te2: 200 } };
        const maxp = { data: { maxPower: 42 } };
        const alarm = { data: { og: true, isce1: false, isce2: 1, oe: 0 } };
        const onoff = { data: { status: 0 } };

        await adapter.updateStatesForDevice("testdev", info, output, maxp, alarm, onoff);

        expect(states["devices.testdev.deviceId"].val).to.equal("D1");
        expect(states["devices.testdev.output.p"].val).to.equal(30);
        expect(states["devices.testdev.control.maxPower"].val).to.equal(42);
        expect(states["devices.testdev.alarm.og"].val).to.equal(true);
        expect(states["devices.testdev.alarm.isce1"].val).to.equal(false);
        expect(states["devices.testdev.control.onOff"].val).to.equal(true);
    });
});
