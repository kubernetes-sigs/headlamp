# Function: getResourceMetrics()

```ts
function getResourceMetrics(
   item: Node, 
   metrics: KubeMetrics[], 
   resourceType: "cpu" | "memory"): any[]
```

## Parameters

| Parameter | Type |
| ------ | ------ |
| `item` | [`Node`](../../k8s/node/classes/Node.md) |
| `metrics` | [`KubeMetrics`](../../k8s/cluster/interfaces/KubeMetrics.md)[] |
| `resourceType` | `"cpu"` \| `"memory"` |

## Returns

`any`[]

## Defined in

[src/lib/util.ts:153](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/util.ts#L153)
