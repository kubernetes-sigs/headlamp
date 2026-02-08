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

[src/lib/k8s/ResourceCategory.tsx:98](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/ResourceCategory.tsx#L98)
