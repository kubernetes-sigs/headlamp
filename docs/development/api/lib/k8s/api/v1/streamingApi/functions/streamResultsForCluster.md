# Function: streamResultsForCluster()

```ts
function streamResultsForCluster(
   url: string, 
   params: StreamResultsParams, 
queryParams?: QueryParameters): Promise<() => void>
```

## Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |
| `params` | [`StreamResultsParams`](../interfaces/StreamResultsParams.md) |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |

## Returns

`Promise`\<() => `void`\>

## Defined in

[src/lib/k8s/api/v1/streamingApi.ts:141](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L141)
