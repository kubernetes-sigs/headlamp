[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / ScaleResourceEvent

# Interface: ScaleResourceEvent

[plugin/registry](../modules/plugin_registry.md).ScaleResourceEvent

Event fired when scaling a resource.

## Properties

### data

• **data**: `Object`

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `resource` | `any` | The resource for which the deletion was called. |
| `status` | `CONFIRMED` | What exactly this event represents. 'CONFIRMED' when the scaling is selected by the user. For now only 'CONFIRMED' is sent. |

#### Defined in

[redux/headlampEventSlice.ts:115](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L115)

___

### type

• **type**: `SCALE_RESOURCE`

#### Defined in

[redux/headlampEventSlice.ts:114](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L114)
