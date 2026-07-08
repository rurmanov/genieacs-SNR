# GenieACS Provisioning Scripts Reference

## Overview

Provision scripts are JavaScript (ES6, strict mode) executed server-side per device. Scripts are mapped to devices via presets. Scripts may execute multiple times per session until stable state is reached. All data model-mutating operations are idempotent.

Arguments passed from preset configuration are available via global `args` array.

---

## Core Functions

### declare(path, timestamps?, values?)

Declares parameter values to set and/or constraints on how recent cached values should be.

**Parameters:**
- `path` (string): Parameter path. Supports wildcards (`*`) and alias filters (`[key:value,key2:value2]`).
- `timestamps` (object|null, optional): Object where keys are attribute names and values are Unix timestamps (integers). If cached timestamp is lower, value is fetched from device.
- `values` (object|null, optional): Object where keys are attribute names and values are the values to set.

**Returns:** `ParameterWrapper` — iterable object with lazy property access.

**Available attributes for timestamps and values:**

| Attribute | Type in timestamps | Type in values | Description |
|-----------|-------------------|----------------|-------------|
| `value` | number (timestamp) | `string \| number \| boolean \| [value, type?]` | Parameter value. Not available for objects/instances. If not `[value, type]` array, type is inferred. |
| `writable` | number (timestamp) | boolean | Whether parameter is writable (regular params), can add instances (objects), or can delete instance (object instances). |
| `object` | number (timestamp) | boolean | True if parameter is an object or object instance. |
| `path` | number (timestamp) | number | Special: refers to presence of parameters matching path. Used to create/delete instances (set to desired count) or refresh path discovery. |
| `notification` | number (timestamp) | number | Notification attribute. |
| `accessList` | number (timestamp) | string[] | Access list attribute. |

**ParameterWrapper properties:**
- `path` (string|undefined): Resolved path of the parameter
- `size` (number|undefined): Number of matching parameters
- `object` (0|1|undefined): Whether parameter is an object
- `writable` (0|1|undefined): Whether parameter is writable
- `value` ([value, type]|undefined): Parameter value as [value, type] tuple
- `notification` (number|undefined): Notification value
- `accessList` (string[]|undefined): Access list
- Iterable: yields ParameterWrapper for each matching parameter

**Behavior:**
- Accessing any property on ParameterWrapper triggers implicit `commit()` if there are uncommitted declarations.
- Wildcard paths (`*`) match zero or more parameters.
- Alias filters `[key:value]` filter by sibling parameter values.

**Examples:**

```javascript
// Read serial number and set SSID
let serial = declare("Device.DeviceInfo.SerialNumber", {value: 1});
declare("Device.LANDevice.1.WLANConfiguration.1.SSID", null, {value: serial.value[0]});

// Ensure exactly one WANIPConnection instance
declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.*", null, {path: 1});

// Delete all instances, then add specific ones
declare("Device.X_Config.List.[]", null, {path: 0});
declare("Device.X_Config.List.[Name:entry1]", {path: Date.now()}, {path: 1});

// Read with freshness constraint
let param = declare("Device.DeviceInfo.HardwareVersion", {value: Date.now() - 3600000});
```

---

### clear(path, timestamp, attributes?)

Invalidates cached database copy of parameters matching path with refresh timestamp less than given timestamp.

**Parameters:**
- `path` (string): Parameter path (supports wildcards).
- `timestamp` (number): Unix timestamp threshold.
- `attributes` (object, optional): Object specifying which attributes to clear (keys: `path`, `object`, `writable`, `value`, `notification`, `accessList`).

**Returns:** void

**Examples:**

```javascript
// Clear entire data model after factory reset (use on "0 BOOTSTRAP" event)
clear("Device", Date.now());
clear("InternetGatewayDevice", Date.now());
```

---

### commit()

Commits pending declarations and performs sync with device. Usually called implicitly at script end or when accessing ParameterWrapper properties. Call explicitly to control order of parameter configuration.

**Parameters:** none
**Returns:** void

**Note:** Do not call from within try/catch block.

---

### ext(file, function, ...args)

Executes an extension script and returns result. Extensions run in separate process (genieacs-ext).

**Parameters:**
- `file` (string): Extension script filename.
- `function` (string): Function name within the script.
- `...args` (any): Arguments passed to the function.

**Returns:** any — result from extension function.

**Behavior:**
- If result is cached for current revision, returns cached value.
- Otherwise, pauses script execution, runs extension, and restarts script with cached result.

**Examples:**

```javascript
let result = ext("my-extension", "lookupDevice", args[0]);
```

---

### log(message, meta?)

Prints message to genieacs-cwmp access log. For debugging purposes.

**Parameters:**
- `message` (string): Log message.
- `meta` (object, optional): Additional metadata key-value pairs.

**Returns:** void

**Note:** Script may execute multiple times, producing duplicate log entries.

**Examples:**

```javascript
log("Processing device", {step: "init"});
log("Value found: " + serial.value[0]);
```

---

## Global Variables

### args

Type: `unknown[]`

Array of arguments passed from preset configuration to the provision script.

**Examples:**

```javascript
let ssid = args[0];
let password = args[1];
declare("Device.LANDevice.1.WLANConfiguration.1.SSID", null, {value: ssid});
```

---

## Built-in Provision Functions

These are higher-level functions implemented on top of `declare()`. They are available as provision script commands (called by name in preset configuration).

### refresh(path, every?, refreshChildren?)

Refreshes parameter values from device at specified interval.

**Arguments:**
- `path` (string): Parameter path to refresh.
- `every` (number, optional): Refresh interval in seconds. Default: 1.
- `refreshChildren` (boolean, optional): Whether to refresh child parameters. Default: true.

**Behavior:**
- Creates declarations with timestamp based on interval and device-specific variance offset.
- If `refreshChildren` is true, extends path with wildcards up to MAX_DEPTH.

**Examples:**

```javascript
// Refresh DeviceInfo every 60 seconds
refresh("Device.DeviceInfo", 60);

// Refresh specific parameter, no children
refresh("Device.DeviceInfo.SerialNumber", 300, false);
```

---

### value(path, value) or value(path, attribute, value)

Sets a parameter value or attribute.

**Arguments (3-arg form):**
- `path` (string): Parameter path.
- `value` (any): Value to set (attribute defaults to "value").

**Arguments (4-arg form):**
- `path` (string): Parameter path.
- `attribute` (string): Attribute name ("value", "writable", "object", "notification", "accessList").
- `value` (any): Value to set.

**Behavior:**
- For `accessList` attribute, value is split by comma and trimmed.
- For `value` attribute, value is wrapped in array.

**Examples:**

```javascript
// Set SSID
value("Device.LANDevice.1.WLANConfiguration.1.SSID", "MyNetwork");

// Set access list
value("Device.ManagementServer.PeriodicInformInterval", "accessList", "admin, operator");
```

---

### tag(tagName, tagValue)

Sets or removes a device tag.

**Arguments:**
- `tagName` (string): Tag name.
- `tagValue` (boolean): true to add tag, false to remove.

**Behavior:**
- Operates on `Tags.<tagName>` path.

**Examples:**

```javascript
// Add tag
tag("provisioned", true);

// Remove tag
tag("needs-update", false);
```

---

### reboot()

Triggers device reboot.

**Arguments:** none

**Behavior:**
- Sets `Reboot` parameter value to current session timestamp.

**Examples:**

```javascript
// Reboot device
reboot();
```

---

### reset()

Triggers factory reset.

**Arguments:** none

**Behavior:**
- Sets `FactoryReset` parameter value to current session timestamp.

**Examples:**

```javascript
// Factory reset
reset();
```

---

### download(fileType, fileName, targetFileName?)

Triggers file download to device.

**Arguments:**
- `fileType` (string): File type (e.g., "1 Firmware Upgrade Image", "3 Vendor Configuration File").
- `fileName` (string): Source filename on server.
- `targetFileName` (string, optional): Target filename on device.

**Behavior:**
- Creates/updates Downloads instance with matching FileType, FileName, TargetFileName.
- Sets Download timestamp to trigger download.

**Common file types:**
- `1 Firmware Upgrade Image`
- `2 Web Content`
- `3 Vendor Configuration File`
- `4 Tone File`
- `5 Ringer File`

**Examples:**

```javascript
// Download firmware
download("1 Firmware Upgrade Image", "firmware-v2.0.tar");

// Download config with target filename
download("3 Vendor Configuration File", "config.xml", "device-config.xml");
```

---

### upload(fileType, fileName)

Triggers file upload from device.

**Arguments:**
- `fileType` (string): File type.
- `fileName` (string): Target filename on server.

**Behavior:**
- Creates/updates Uploads instance with matching FileType, FileName.
- Sets Upload timestamp to trigger upload.

**Examples:**

```javascript
// Upload device config
upload("3 Vendor Configuration File", "backup-config.xml");
```

---

### instances(path, count)

Sets the number of instances for an object.

**Arguments:**
- `path` (string): Object path (typically ending with `.*` or instance path).
- `count` (number|string): Desired instance count. If string starts with `+` or `-`, it's relative to current count.

**Behavior:**
- If count is relative (`+N` or `-N`), first reads current instance count, then calculates absolute count.
- GenieACS creates or deletes instances to match declared count.

**Examples:**

```javascript
// Ensure exactly 2 WANIPConnection instances
instances("Device.WANDevice.1.WANConnectionDevice.1.WANIPConnection.*", 2);

// Add one more instance
instances("Device.LANDevice.1.Hosts.Host.*", "+1");

// Remove one instance
instances("Device.LANDevice.1.Hosts.Host.*", "-1");
```

---

## Special Parameters

### DeviceID (read-only)

Device identification parameters:
- `DeviceID.ID`
- `DeviceID.SerialNumber`
- `DeviceID.ProductClass`
- `DeviceID.OUI`
- `DeviceID.Manufacturer`

### Tags

Virtual parameters for device tags. Child parameters are writable booleans.
- Setting to `false` deletes the tag.
- Setting non-existing tag to `true` creates it.

### Reboot

Timestamp of last reboot command. Setting value larger than current triggers reboot.

### FactoryReset

Like Reboot but for factory reset.

### Downloads

Sub-tree for download commands. Instances contain:
- `FileType`, `FileName`, `TargetFileName` (writable)
- `Download` (writable timestamp, triggers download)
- `LastFileType`, `LastFileName` (read-only, last completed)

### Uploads

Sub-tree for upload commands. Similar structure to Downloads.

---

## Path Format

### Wildcards

`*` matches any single path segment:
```
Device.LANDevice.*.WLANConfiguration.1.SSID
```

### Alias Filters

`[key:value]` or `[key1:value1,key2:value2]` filters by sibling parameter values:
```
Device.WANDevice.1.WANConnectionDevice.1.WANIPConnection.[AddressingType:DHCP].ExternalIPAddress
```

### Instance Creation/Deletion

Use `path` attribute in `declare()` with desired count:
```javascript
// Ensure exactly 1 instance
declare("Device.Object.*", null, {path: 1});

// Delete all instances
declare("Device.Object.[]", null, {path: 0});

// Create instance with alias
declare("Device.Object.[Name:myentry]", {path: Date.now()}, {path: 1});
```

---

## Date Object (Sandboxed)

The `Date` constructor is sandboxed:
- `new Date()` returns date at session timestamp (not real current time).
- `Date.now(intervalOrCron?, variance?)` returns session timestamp, optionally quantized to interval or cron schedule.

**Date.now() with interval:**
```javascript
// Quantize to 1-hour intervals with device-specific variance
let t = Date.now(3600000);
```

**Date.now() with cron:**
```javascript
// Quantize to daily at 3am
let t = Date.now("0 3 * * *");
```

---

## Math.random() (Deterministic)

`Math.random()` is seeded with device ID, producing deterministic results per device.

```javascript
// Same result for same device every time
let r = Math.random();
```

Use `Math.random.seed(string)` to reseed with custom value.

---

## Script Execution Model

1. Script runs in sandboxed VM context with 50ms timeout.
2. `declare()` calls accumulate declarations.
3. Accessing ParameterWrapper properties triggers implicit `commit()`.
4. `commit()` increments revision and syncs with device.
5. Script re-runs until no more side effects (stable state).
6. `ext()` calls pause script, execute extension, then restart script with cached result.

---

## Common Patterns

### Conditional Configuration

```javascript
let serial = declare("Device.DeviceInfo.SerialNumber", {value: 1});
if (serial.value && serial.value[0].startsWith("ABC")) {
  declare("Device.LANDevice.1.WLANConfiguration.1.SSID", null, {value: "Network-" + serial.value[0].slice(-6)});
}
```

### Event-Based Actions

```javascript
// Check for bootstrap event (factory reset)
let inform = declare("Device.DeviceInfo", {value: 1});
if (args[0] === "0 BOOTSTRAP") {
  clear("Device", Date.now());
  clear("InternetGatewayDevice", Date.now());
}
```

### Iterating Over Instances

```javascript
let hosts = declare("Device.LANDevice.1.Hosts.Host.*", {value: 1});
for (let host of hosts) {
  log("Host: " + host.path);
}
```

### Using Extensions

```javascript
let config = ext("config-server", "getConfig", declare("DeviceID.SerialNumber", {value: 1}).value[0]);
if (config) {
  declare("Device.LANDevice.1.WLANConfiguration.1.SSID", null, {value: config.ssid});
  declare("Device.LANDevice.1.WLANConfiguration.1.KeyPassphrase", null, {value: config.password});
}
```

### Firmware Upgrade with Reboot

```javascript
// On BOOT event, check and upgrade firmware
let hwVersion = declare("Device.DeviceInfo.HardwareVersion", {value: 1}).value[0];
let swVersion = declare("Device.DeviceInfo.SoftwareVersion", {value: 1}).value[0];

if (swVersion !== "2.0.0") {
  download("1 Firmware Upgrade Image", "firmware-2.0.0-" + hwVersion + ".bin");
  // Reboot after transfer complete (use "7 TRANSFER COMPLETE" event)
}