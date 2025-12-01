# ioBroker APsystems EZ1 Adapter

**Author:** haining zhi (https://github.com/zhihaining)

This adapter integrates with APsystems EZ1 microinverters via the device's Local HTTP API (port 8050). It supports reading realtime power/energy, device info, alarms and allows setting MaxPower and On/Off state.

## Features
- Polls /getDeviceInfo, /getOutputData, /getMaxPower, /getAlarm, /getOnOff
- Allows /setMaxPower and /setOnOff via adapter states
- Supports multiple devices in a single adapter instance (devices array)
- HTTP timeout and retry logic (axios + axios-retry)
- Basic alerting via email when repeated errors occur

## Installation (development)
1. Copy repository into your ioBroker development folder or clone to the ioBroker host.
2. Run `npm install` inside the adapter folder.
3. In ioBroker Admin -> Adapters -> Install from `io-package.json` or use `iobroker add apsystems-ez1` / `iobroker upload`.
4. Configure the adapter instance: set Devices (JSON array) or single deviceIp, poll interval, timeout, retries.

## Configuration
- Devices: JSON array, e.g. `[{ "name":"Roof", "ip":"192.168.1.50" }, { "name":"Garage", "ip":"192.168.1.51" }]`
- pollInterval: seconds between polls (default 30)
- httpTimeout: ms timeout for HTTP requests
- httpRetries: number of retries for transient failures
- alertEmail: optional email address to receive persistent error alerts (requires local sendmail)

## States (created under `apsystems-ez1.0.devices.<Name>.*`)
- deviceId (string) - Device ID
- devVer (string) - Firmware version
- ssid (string) - Connected SSID
- ipAddr (string) - Device IP
- minPower (number) - Min supported power (W)
- maxPower (number) - Max supported power (W)
- output.p1 (number) - Power channel1 (W)
- output.p2 (number) - Power channel2 (W)
- output.e1 (number) - Energy channel1 (kWh)
- output.e2 (number) - Energy channel2 (kWh)
- output.te1 (number) - Lifetime energy channel1 (kWh)
- output.te2 (number) - Lifetime energy channel2 (kWh)
- control.maxPower (number, write) - Set Max Power (W)
- control.onOff (number, write) - Set On/Off (0=On,1=Off)
- alarm.og (number) - Off-grid alarm (0/1)
- alarm.isce1 (number) - DC1 short circuit (0/1)
- alarm.isce2 (number) - DC2 short circuit (0/1)
- alarm.oe (number) - Output fault (0/1)

## VIS2 widget
A VIS2 widget template is included under `vis2/ez1-control` to show power, energy and controls. Update the widget to use your adapter instance id if required.

## API endpoints (EZ1 Local API) — from official manual
- GET /getDeviceInfo
- GET /getOutputData
- GET /getMaxPower
- GET /getAlarm
- GET /getOnOff
- GET /setMaxPower?p=VALUE
- GET /setOnOff?status=0|1

## Publishing to GitHub
1. Create a repository named `iobroker.apsystems-ez1` on GitHub.
2. Push the folder contents to the repo.
3. Users can install using ioBroker Admin -> Install from URL or via `iobroker install https://github.com/<user>/iobroker.apsystems-ez1`

---
