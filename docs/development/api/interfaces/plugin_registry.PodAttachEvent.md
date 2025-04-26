[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / PodAttachEvent

# Interface: PodAttachEvent

[plugin/registry](../modules/plugin_registry.md).PodAttachEvent

Event fired when attaching to a pod.

## Properties

### data

• **data**: `Object`

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `resource?` | [`Pod`](../classes/lib_k8s_pod.Pod.md) | The resource for which the terminal was opened (currently this only happens for Pod instances). |
| `status` | `OPENED` \| `CLOSED` | What exactly this event represents. 'OPEN' when the attach dialog is opened. 'CLOSED' when it is closed. |

#### Defined in

[redux/headlampEventSlice.ts:178](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L178)

___

### type

• **type**: `POD_ATTACH`

#### Defined in

[redux/headlampEventSlice.ts:177](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/redux/headlampEventSlice.ts#L177)
