[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / DeleteResourceEvent

# Interface: DeleteResourceEvent

[plugin/registry](../modules/plugin_registry.md).DeleteResourceEvent

Event fired when a resource is to be deleted.

## Hierarchy

- [`HeadlampEvent`](plugin_registry.HeadlampEvent.md)<`HeadlampEventType.DELETE_RESOURCE`\>

  ↳ **`DeleteResourceEvent`**

## Properties

### data

• **data**: `Object`

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `resource` | `any` | The resource for which the deletion was called. |
| `status` | `CONFIRMED` | What exactly this event represents. 'CONFIRMED' when the user confirms the deletion of a resource. For now only 'CONFIRMED' is sent. |

#### Overrides

[HeadlampEvent](plugin_registry.HeadlampEvent.md).[data](plugin_registry.HeadlampEvent.md#data)

#### Defined in

[redux/headlampEventSlice.ts:85](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L85)

___

### type

• **type**: `DELETE_RESOURCE`

#### Inherited from

[HeadlampEvent](plugin_registry.HeadlampEvent.md).[type](plugin_registry.HeadlampEvent.md#type)

#### Defined in

[redux/headlampEventSlice.ts:68](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L68)
