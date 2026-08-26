# Function: useNodeSummaryStats()

```ts
function useNodeSummaryStats(nodeName?: string, cluster?: string): [
  | KubeNodeSummaryStats
  | null, ApiError | null];
```

Defined in: [lib/k8s/node.ts:92](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/node.ts#L92)

Hook to fetch summary stats for a node.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `nodeName?` | `string` |
| `cluster?` | `string` |

## Returns

\[
  \| [`KubeNodeSummaryStats`](../../api/v2/nodeSummaryApi/interfaces/KubeNodeSummaryStats.md)
  \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\]
