# Function: getCluster()

```ts
function getCluster(urlPath?: string): string | null
```

Get the currently selected cluster name.

If more than one cluster is selected it will return:
 - On details pages: the cluster of the currently viewed resource
 - On any other page: one of the selected clusters

To get all currently selected clusters please use getSelectedClusters

## Parameters

| Parameter | Type |
| ------ | ------ |
| `urlPath`? | `string` |

## Returns

`string` \| `null`

The current cluster name, or null if not in a cluster context.

## Defined in

[src/lib/cluster.ts:46](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/cluster.ts#L46)
