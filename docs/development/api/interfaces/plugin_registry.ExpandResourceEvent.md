[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / ExpandResourceEvent

# Interface: ExpandResourceEvent

[plugin/registry](../modules/plugin_registry.md).ExpandResourceEvent

Event fired when expanding a resource.

## Hierarchy

- [`HeadlampEvent`](plugin_registry.HeadlampEvent.md)<`EXPAND_RESOURCE`\>

  ↳ **`ExpandResourceEvent`**

## Properties

### data

• **data**: `Object`

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `resource` | `KubeObject` | The resource for which expansion was called. |
| `status` | `CONFIRMED` | What exactly this event represents. 'CONFIRMED' when the expansion is confirmed by the user. For now only 'CONFIRMED' is sent. |

#### Overrides

HeadlampEvent.data

#### Defined in

[redux/headlampEventSlice.ts:201](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/redux/headlampEventSlice.ts#L201)

___

### type

• **type**: `EXPAND_RESOURCE`

#### Inherited from

HeadlampEvent.type

#### Defined in

[redux/headlampEventSlice.ts:110](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/redux/headlampEventSlice.ts#L110)
