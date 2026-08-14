# Function: useNodeMetrics()

```ts
function useNodeMetrics(cluster?: string): [KubeMetrics[] | null, ApiError | null];
```

Defined in: [lib/k8s/nodeHooks.ts:41](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/nodeHooks.ts#L41)

Standalone hook equivalent of Node.useMetrics.

Fetches node metrics from the Kubernetes metrics API server.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster?` | `string` | Optional cluster name to fetch metrics from. |

## Returns

\[[`KubeMetrics`](../../cluster/interfaces/KubeMetrics.md)[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\]

A tuple of [metrics array or null, error or null].
