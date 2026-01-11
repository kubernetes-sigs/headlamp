# Function: metrics()

```ts
function metrics(
   url: string, 
   onMetrics: (arg: KubeMetrics[]) => void, 
   onError?: (err: ApiError) => void, 
cluster?: string): Promise<() => void>
```

Gets the metrics for the specified resource. Gets new metrics every 10 seconds.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `url` | `string` | The url of the resource to get metrics for. |
| `onMetrics` | (`arg`: [`KubeMetrics`](../../../../cluster/interfaces/KubeMetrics.md)[]) => `void` | The function to call with the metrics. |
| `onError`? | (`err`: [`ApiError`](../../../v2/ApiError/classes/ApiError.md)) => `void` | The function to call if there's an error. |
| `cluster`? | `string` | The cluster to get metrics for. By default uses the current cluster (URL defined). |

## Returns

`Promise`\<() => `void`\>

A function to cancel the metrics request.

## Defined in

[src/lib/k8s/api/v1/metricsApi.ts:33](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/metricsApi.ts#L33)
