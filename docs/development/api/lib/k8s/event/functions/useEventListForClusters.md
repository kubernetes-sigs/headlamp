# Function: useEventListForClusters()

```ts
function useEventListForClusters(clusterNames: string[], options?: object): EventsPerCluster;
```

Defined in: [lib/k8s/event.ts:211](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/event.ts#L211)

Fetch events for given clusters

Important! Make sure to have the parent component have clusters as a key
so that component remounts when clusters change, instead of rerendering
with different number of clusters

## Parameters

| Parameter | Type |
| ------ | ------ |
| `clusterNames` | `string`[] |
| `options` | \{ `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `options.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

## Returns

`EventsPerCluster`
