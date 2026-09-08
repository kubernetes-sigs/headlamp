# Function: getKubeObjectCategory()

```ts
function getKubeObjectCategory(resource: KubeObject): ResourceCategory;
```

Defined in: [lib/k8s/ResourceCategory.tsx:98](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/ResourceCategory.tsx#L98)

Get category of the given kubernetes object

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `resource` | [`KubeObject`](../../KubeObject/classes/KubeObject.md) | Kubernetes object |

## Returns

[`ResourceCategory`](../interfaces/ResourceCategory.md)

resource category
