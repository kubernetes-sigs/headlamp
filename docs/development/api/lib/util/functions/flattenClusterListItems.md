# Function: flattenClusterListItems()

```ts
function flattenClusterListItems<T>(...args: (null | object)[]): T[] | null
```

This function joins a list of items per cluster into a single list of items.

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`args` | (`null` \| `object`)[] | The list of objects per cluster to join. |

## Returns

`T`[] \| `null`

The joined list of items, or null if there are no items.

## Defined in

[src/lib/util.ts:218](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/util.ts#L218)
