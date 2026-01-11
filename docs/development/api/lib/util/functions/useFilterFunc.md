# Function: useFilterFunc()

```ts
function useFilterFunc<T>(matchCriteria?: string[]): (item: T, search?: string) => boolean
```

Get a function to filter kube resources based on the current global filter state.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* [`KubeObjectInterface`](../../k8s/KubeObject/interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../k8s/event/interfaces/KubeEvent.md) \| `object` | [`KubeObjectInterface`](../../k8s/KubeObject/interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../k8s/event/interfaces/KubeEvent.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `matchCriteria`? | `string`[] | The JSONPath criteria to match. |

## Returns

`Function`

A filter function that can be used to filter a list of items.

### Parameters

| Parameter | Type |
| ------ | ------ |
| `item` | `T` |
| `search`? | `string` |

### Returns

`boolean`

## Defined in

[src/lib/util.ts:181](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/util.ts#L181)
