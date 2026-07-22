# Function: getResourceMetrics()

```ts
function getResourceMetrics(
   item: Node, 
   metrics: KubeMetrics[], 
   resourceType: "cpu" | "memory"): any[];
```

Defined in: [lib/util.ts:291](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/util.ts#L291)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `item` | [`Node`](../../k8s/node/classes/Node.md) |
| `metrics` | [`KubeMetrics`](../../k8s/cluster/interfaces/KubeMetrics.md)[] |
| `resourceType` | `"cpu"` \| `"memory"` |

## Returns

`any`[]
