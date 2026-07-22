# Function: useNodeMetrics()

```ts
function useNodeMetrics(cluster?: string): [KubeMetrics[] | null, ApiError | null];
```

Defined in: [lib/k8s/node.ts:120](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/node.ts#L120)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster?` | `string` |

## Returns

\[[`KubeMetrics`](../../cluster/interfaces/KubeMetrics.md)[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\]
