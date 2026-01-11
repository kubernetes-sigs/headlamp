# Function: filterGeneric()

```ts
function filterGeneric<T>(
   item: T, 
   search?: string, 
   matchCriteria?: string[]): boolean
```

Filters a generic item based on the filter state.

The item is considered to match if any of the matchCriteria (described as JSONPath)
matches the filter.search contents. Case matching is insensitive.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* `object` | `object` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `item` | `T` | The item to filter. |
| `search`? | `string` | - |
| `matchCriteria`? | `string`[] | The JSONPath criteria to match. |

## Returns

`boolean`

## Defined in

[src/redux/filterSlice.ts:90](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/filterSlice.ts#L90)
