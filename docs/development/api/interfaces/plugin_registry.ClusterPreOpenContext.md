[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / ClusterPreOpenContext

# Interface: ClusterPreOpenContext

[plugin/registry](../modules/plugin_registry.md).ClusterPreOpenContext

Context passed to a [ClusterPreOpenHook](../modules/plugin_registry.md#clusterpreopenhook) when a cluster is about to be opened.

## Properties

### cluster

• **cluster**: `string`

The name of the cluster being opened.

#### Defined in

[redux/clusterProviderSlice.ts:57](https://github.com/kubernetes-sigs/headlamp/blob/1079044ed/frontend/src/redux/clusterProviderSlice.ts#L57)

___

### clusterConf

• **clusterConf**: `unknown`

The cluster's configuration, as known to the app, or `null` if unavailable.
Typed `unknown` so this slice does not depend on the k8s cluster types while
still requiring hook authors to narrow before use.

#### Defined in

[redux/clusterProviderSlice.ts:63](https://github.com/kubernetes-sigs/headlamp/blob/1079044ed/frontend/src/redux/clusterProviderSlice.ts#L63)

___

### reportProgress

• `Optional` **reportProgress**: (`message`: `string`) => `void`

Reports human-readable progress for the connecting popup shown while the cluster
is being prepared. Hooks that do not report progress show a generic message.

#### Type declaration

▸ (`message`): `void`

##### Parameters

| Name | Type |
| :------ | :------ |
| `message` | `string` |

##### Returns

`void`

#### Defined in

[redux/clusterProviderSlice.ts:76](https://github.com/kubernetes-sigs/headlamp/blob/1079044ed/frontend/src/redux/clusterProviderSlice.ts#L76)

___

### signal

• `Optional` **signal**: `AbortSignal`

Aborts when preparation is no longer wanted because the user left the cluster.
Long-running hooks should pass it to awaited operations or check it between
steps.

#### Defined in

[redux/clusterProviderSlice.ts:70](https://github.com/kubernetes-sigs/headlamp/blob/1079044ed/frontend/src/redux/clusterProviderSlice.ts#L70)
