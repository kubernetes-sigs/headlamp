# Function: useEventWarningList()

```ts
function useEventWarningList(clusters: string[], options?: object): EventsPerCluster;
```

Defined in: [lib/k8s/event.ts:259](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/event.ts#L259)

Fetch warning events for given clusters
Amount is limited to [Event.maxLimit](../classes/Event.md#maxlimit)

Important! Make sure to have the parent component have clusters as a key
so that component remounts when clusters change, instead of rerendering
with different number of clusters

## Parameters

| Parameter | Type |
| ------ | ------ |
| `clusters` | `string`[] |
| `options?` | \{ `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `options.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

## Returns

`EventsPerCluster`
