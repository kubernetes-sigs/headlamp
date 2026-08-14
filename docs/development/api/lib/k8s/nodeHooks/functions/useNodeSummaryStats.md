# Function: useNodeSummaryStats()

```ts
function useNodeSummaryStats(nodeName?: string, cluster?: string): [
  | KubeNodeSummaryStats
  | null, ApiError | null];
```

Defined in: [lib/k8s/nodeHooks.ts:66](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/nodeHooks.ts#L66)

Standalone hook equivalent of Node.useNodeSummaryStats.

Fetches summary statistics for a specific node from the kubelet summary API.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nodeName?` | `string` | Name of the node to fetch summary stats for. |
| `cluster?` | `string` | Optional cluster name. |

## Returns

\[
  \| [`KubeNodeSummaryStats`](../../api/v2/nodeSummaryApi/interfaces/KubeNodeSummaryStats.md)
  \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\]

A tuple of [summary stats or null, error or null].
