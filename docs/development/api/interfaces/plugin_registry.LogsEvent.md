[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / LogsEvent

# Interface: LogsEvent

[plugin/registry](../modules/plugin_registry.md).LogsEvent

Event fired when viewing pod logs.

## Properties

### data

• **data**: `Object`

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `resource?` | `any` | The resource for which the terminal was opened (currently this only happens for Pod instances). |
| `status` | `OPENED` \| `CLOSED` | What exactly this event represents. 'OPEN' when the logs dialog is opened. 'CLOSED' when it is closed. |

#### Defined in

[redux/headlampEventSlice.ts:145](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L145)

___

### type

• **type**: `LOGS`

#### Defined in

[redux/headlampEventSlice.ts:144](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L144)
