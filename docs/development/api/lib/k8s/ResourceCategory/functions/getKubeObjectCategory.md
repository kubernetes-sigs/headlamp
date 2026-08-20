# Function: getKubeObjectCategory()

```ts
function getKubeObjectCategory(resource: KubeObject): ResourceCategory;
```

Defined in: [lib/k8s/ResourceCategory.tsx:98](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ResourceCategory.tsx#L98)

Get category of the given kubernetes object

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `resource` | [`KubeObject`](../../KubeObject/classes/KubeObject.md) | Kubernetes object |

## Returns

[`ResourceCategory`](../interfaces/ResourceCategory.md)

resource category
