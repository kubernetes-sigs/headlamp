# Function: useFilterFunc()

```ts
function useFilterFunc<T>(matchCriteria?: string[]): (item: T, search?: string) => boolean;
```

Defined in: [lib/util.ts:319](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/util.ts#L319)

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
