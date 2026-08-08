# Function: flattenClusterListItems()

```ts
function flattenClusterListItems<T>(...args: (
  | {
[cluster: string]: T[] | null;
}
  | null)[]): T[] | null;
```

Defined in: [lib/util.ts:356](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/util.ts#L356)

This function joins a list of items per cluster into a single list of items.

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`args` | ( \| \{ \[`cluster`: `string`\]: `T`[] \| `null`; \} \| `null`)[] | The list of objects per cluster to join. |

## Returns

`T`[] \| `null`

The joined list of items, or null if there are no items.
