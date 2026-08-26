# Function: getKubeObjectCategory()

```ts
function getKubeObjectCategory(resource: KubeObject): ResourceCategory;
```

Defined in: [lib/k8s/ResourceCategory.tsx:98](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ResourceCategory.tsx#L98)

Get category of the given kubernetes object

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `resource` | [`KubeObject`](../../KubeObject/classes/KubeObject.md) | Kubernetes object |

## Returns

[`ResourceCategory`](../interfaces/ResourceCategory.md)

resource category
