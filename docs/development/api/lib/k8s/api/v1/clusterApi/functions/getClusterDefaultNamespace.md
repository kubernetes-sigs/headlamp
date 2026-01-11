# Function: getClusterDefaultNamespace()

```ts
function getClusterDefaultNamespace(cluster: string, checkSettings?: boolean): string
```

getClusterDefaultNamespace gives the default namespace for the given cluster.

If the checkSettings parameter is true (default), it will check the cluster settings first.
Otherwise it will just check the cluster config. This means that if one needs the default
namespace that may come from the kubeconfig, call this function with the checkSettings parameter as false.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The cluster name. |
| `checkSettings`? | `boolean` | Whether to check the settings for the default namespace (otherwise it just checks the cluster config). Defaults to true. |

## Returns

`string`

The default namespace for the given cluster.

## Defined in

[src/lib/k8s/api/v1/clusterApi.ts:161](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterApi.ts#L161)
