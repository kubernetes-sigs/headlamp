# Function: useNodeMetrics()

```ts
function useNodeMetrics(cluster?: string): [KubeMetrics[] | null, ApiError | null];
```

Defined in: [lib/k8s/node.ts:70](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/node.ts#L70)

Hook to fetch metrics for nodes.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster?` | `string` |

## Returns

\[[`KubeMetrics`](../../cluster/interfaces/KubeMetrics.md)[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\]
