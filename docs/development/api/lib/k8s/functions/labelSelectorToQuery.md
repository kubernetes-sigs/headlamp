# Function: labelSelectorToQuery()

```ts
function labelSelectorToQuery(labelSelector: LabelSelector): string
```

See [selector examples](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#list-and-watch-filtering|Label),
[selector example](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#resources-that-support-set-based-requirements|deployment),
[operators](https://github.com/kubernetes/apimachinery/blob/be3a79b26814a8d7637d70f4d434a4626ee1c1e7/pkg/selection/operator.go#L24|possible), and
[rule for expressions](https://github.com/kubernetes/apimachinery/blob/be3a79b26814a8d7637d70f4d434a4626ee1c1e7/pkg/labels/selector.go#L305|Format).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `labelSelector` | [`LabelSelector`](../cluster/interfaces/LabelSelector.md) |

## Returns

`string`

## Defined in

[src/lib/k8s/index.ts:223](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/index.ts#L223)
