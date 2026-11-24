[API](../API.md) / lib/k8s/clusterAuthType

# Module: lib/k8s/clusterAuthType

## Functions

### canLogoutFromProvider

▸ **canLogoutFromProvider**(`cluster`): `boolean`

Returns whether a cluster uses provider logout. Stateless kubeconfig contexts
remain local-only because provider logout currently supports server-owned
contexts, not user-scoped stateless redirect bindings.

#### Parameters

| Name      | Type     | Description          |
| :-------- | :------- | :------------------- |
| `cluster` | `string` | Name of the cluster. |

#### Returns

`boolean`

### getClusterAuthType

▸ **getClusterAuthType**(`cluster`): `string`

Returns the auth type of the cluster, or an empty string if the cluster is not
found. For example, it can return `oidc` or an empty string.

#### Parameters

| Name      | Type     | Description          |
| :-------- | :------- | :------------------- |
| `cluster` | `string` | Name of the cluster. |

#### Returns

`string`

#### Defined in

[lib/k8s/clusterAuthType.ts:25](https://github.com/kubernetes-sigs/headlamp/blob/f9e13a76c/frontend/src/lib/k8s/clusterAuthType.ts#L25)
