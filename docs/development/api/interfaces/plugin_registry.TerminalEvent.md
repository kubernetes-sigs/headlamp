[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / TerminalEvent

# Interface: TerminalEvent

[plugin/registry](../modules/plugin_registry.md).TerminalEvent

Event fired when using the terminal.

## Properties

### data

• **data**: `Object`

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `resource?` | `any` | The resource for which the terminal was opened (currently this only happens for Pod instances). |
| `status` | `OPENED` \| `CLOSED` | What exactly this event represents. 'OPEN' when the terminal is opened. 'CLOSED' when it is closed. |

#### Defined in

[redux/headlampEventSlice.ts:163](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L163)

___

### type

• **type**: `TERMINAL`

#### Defined in

[redux/headlampEventSlice.ts:162](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L162)
