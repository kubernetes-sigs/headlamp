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

[src/lib/k8s/api/v1/streamingApi.ts:141](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/streamingApi.ts#L141)
