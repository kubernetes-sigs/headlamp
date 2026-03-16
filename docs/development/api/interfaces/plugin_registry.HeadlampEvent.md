[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / HeadlampEvent

# Interface: HeadlampEvent<EventType\>

[plugin/registry](../modules/plugin_registry.md).HeadlampEvent

Represents a Headlamp event. It can be one of the default events or a custom event.

## Type parameters

| Name | Type |
| :------ | :------ |
| `EventType` | `HeadlampEventType` \| `string` |

## Hierarchy

- **`HeadlampEvent`**

  ↳ [`DeleteResourceEvent`](plugin_registry.DeleteResourceEvent.md)

## Properties

### data

• `Optional` **data**: `unknown`

#### Defined in

[redux/headlampEventSlice.ts:69](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L69)

___

### type

• **type**: `EventType`

#### Defined in

[redux/headlampEventSlice.ts:68](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L68)
