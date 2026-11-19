[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / ClusterDeleteHandler

# Interface: ClusterDeleteHandler

[plugin/registry](../modules/plugin_registry.md).ClusterDeleteHandler

A plugin's claim on the Delete action of the clusters it manages.

For a cluster that `owns` returns true for, the Delete item in the Home page's
cluster action menu opens the plugin's dialog named `dialog` (registered with
`registerClusterProviderDialog`) instead of removing the cluster from the
kubeconfig.

## Properties

### dialog

• **dialog**: `string`

The `openConfirmDialog` value that opens the plugin's delete dialog. It must not be empty or
`deleteDynamic` (`BUILT_IN_DELETE_DIALOG`), the name of Headlamp's own confirmation.

#### Defined in

[redux/clusterProviderSlice.ts:81](https://github.com/kubernetes-sigs/headlamp/blob/26c4d351d/frontend/src/redux/clusterProviderSlice.ts#L81)

___

### owns

• **owns**: (`cluster`: `any`) => `boolean`

#### Type declaration

▸ (`cluster`): `boolean`

Whether the plugin handles Delete for this cluster entry.

##### Parameters

| Name | Type |
| :------ | :------ |
| `cluster` | `any` |

##### Returns

`boolean`

#### Defined in

[redux/clusterProviderSlice.ts:76](https://github.com/kubernetes-sigs/headlamp/blob/26c4d351d/frontend/src/redux/clusterProviderSlice.ts#L76)
