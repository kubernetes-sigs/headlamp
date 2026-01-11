# Function: getKubeObjectCategory()

```ts
function getKubeObjectCategory(resource: KubeObject<any>): ResourceCategory
```

Get category of the given kubernetes object

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `resource` | [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> | Kubernetes object |

## Returns

[`ResourceCategory`](../interfaces/ResourceCategory.md)

resource category

## Defined in

[src/lib/k8s/ResourceCategory.tsx:98](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/ResourceCategory.tsx#L98)
