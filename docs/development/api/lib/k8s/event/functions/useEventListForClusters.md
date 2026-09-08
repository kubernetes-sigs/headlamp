# Function: useEventListForClusters()

```ts
function useEventListForClusters(clusterNames: string[], options?: object): EventsPerCluster;
```

Defined in: [lib/k8s/event.ts:211](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/event.ts#L211)

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
