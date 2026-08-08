# Function: getKubeObjectCategory()

```ts
function getKubeObjectCategory(resource: KubeObject): ResourceCategory;
```

Defined in: [lib/k8s/ResourceCategory.tsx:98](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/ResourceCategory.tsx#L98)

Get category of the given kubernetes object

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `resource` | [`KubeObject`](../../KubeObject/classes/KubeObject.md) | Kubernetes object |

## Returns

[`ResourceCategory`](../interfaces/ResourceCategory.md)

resource category
