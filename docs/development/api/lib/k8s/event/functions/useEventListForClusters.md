# Function: useEventListForClusters()

```ts
function useEventListForClusters(clusterNames: string[], options?: object): EventsPerCluster;
```

Defined in: [lib/k8s/event.ts:211](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/event.ts#L211)

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
