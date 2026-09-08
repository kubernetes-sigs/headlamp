# Function: flattenClusterListItems()

```ts
function flattenClusterListItems<T>(...args: (
  | {
[cluster: string]: T[] | null;
}
  | null)[]): T[] | null;
```

Defined in: [lib/util.ts:356](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/util.ts#L356)

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
