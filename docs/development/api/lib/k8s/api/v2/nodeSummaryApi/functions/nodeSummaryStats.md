# Function: nodeSummaryStats()

```ts
function nodeSummaryStats(
   nodeName: string, 
   onStats: (arg: KubeNodeSummaryStats) => void, 
   onError?: (err: ApiError) => void, 
cluster?: string): Promise<() => void>;
```

Defined in: [lib/k8s/api/v2/nodeSummaryApi.ts:42](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/nodeSummaryApi.ts#L42)

Gets kubelet summary stats for a node. Fetches new stats every 10 seconds.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nodeName` | `string` | The node name. |
| `onStats` | (`arg`: [`KubeNodeSummaryStats`](../interfaces/KubeNodeSummaryStats.md)) => `void` | The function to call with the node summary stats. |
| `onError?` | (`err`: [`ApiError`](../../ApiError/classes/ApiError.md)) => `void` | The function to call if there's an error. |
| `cluster?` | `string` | The cluster to get stats for. By default uses the current cluster (URL defined). |

## Returns

`Promise`\<() => `void`\>

A function to cancel the polling request.
