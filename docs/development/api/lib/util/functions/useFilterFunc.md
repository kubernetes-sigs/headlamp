# Function: useFilterFunc()

```ts
function useFilterFunc<T>(matchCriteria?: string[]): (item: T, search?: string) => boolean;
```

Defined in: [lib/util.ts:319](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/util.ts#L319)

Get a function to filter kube resources based on the current global filter state.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* \| [`KubeObjectInterface`](../../k8s/KubeObject/interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../k8s/event/interfaces/KubeEvent.md) \| \{ \[`key`: `string`\]: `any`; \} | \| [`KubeObjectInterface`](../../k8s/KubeObject/interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../k8s/event/interfaces/KubeEvent.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `matchCriteria?` | `string`[] | The JSONPath criteria to match. |

## Returns

A filter function that can be used to filter a list of items.

(`item`: `T`, `search?`: `string`) => `boolean`
