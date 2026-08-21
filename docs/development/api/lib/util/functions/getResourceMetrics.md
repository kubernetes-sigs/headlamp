# Function: getResourceMetrics()

```ts
function getResourceMetrics(
   item: Node, 
   metrics: KubeMetrics[], 
   resourceType: "cpu" | "memory"): any[];
```

Defined in: [lib/util.ts:291](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/util.ts#L291)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `item` | [`Node`](../../k8s/node/classes/Node.md) |
| `metrics` | [`KubeMetrics`](../../k8s/cluster/interfaces/KubeMetrics.md)[] |
| `resourceType` | `"cpu"` \| `"memory"` |

## Returns

`any`[]
