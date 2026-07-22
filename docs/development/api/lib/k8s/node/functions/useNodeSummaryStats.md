# Function: useNodeSummaryStats()

```ts
function useNodeSummaryStats(nodeName?: string, cluster?: string): [
  | KubeNodeSummaryStats
  | null, ApiError | null];
```

Defined in: [lib/k8s/node.ts:136](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/node.ts#L136)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `nodeName?` | `string` |
| `cluster?` | `string` |

## Returns

\[
  \| [`KubeNodeSummaryStats`](../../api/v2/nodeSummaryApi/interfaces/KubeNodeSummaryStats.md)
  \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\]
