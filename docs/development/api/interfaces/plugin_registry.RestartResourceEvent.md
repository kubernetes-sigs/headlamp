[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / RestartResourceEvent

# Interface: RestartResourceEvent

[plugin/registry](../modules/plugin_registry.md).RestartResourceEvent

Event fired when restarting a resource.

## Properties

### data

• **data**: `Object`

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `resource` | `any` | The resource for which the deletion was called. |
| `status` | `CONFIRMED` | What exactly this event represents. 'CONFIRMED' when the restart is selected by the user. For now only 'CONFIRMED' is sent. |

#### Defined in

[redux/headlampEventSlice.ts:130](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L130)

___

### type

• **type**: `RESTART_RESOURCE`

#### Defined in

[redux/headlampEventSlice.ts:129](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L129)
