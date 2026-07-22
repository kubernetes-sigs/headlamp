# Function: getCluster()

```ts
function getCluster(urlPath?: string): string | null;
```

Defined in: [lib/cluster.ts:46](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/cluster.ts#L46)

Get the currently selected cluster name.

If more than one cluster is selected it will return:
 - On details pages: the cluster of the currently viewed resource
 - On any other page: one of the selected clusters

To get all currently selected clusters please use getSelectedClusters

## Parameters

| Parameter | Type |
| ------ | ------ |
| `urlPath?` | `string` |

## Returns

`string` \| `null`

The current cluster name, or null if not in a cluster context.
