# Function: filterGeneric()

```ts
function filterGeneric<T>(
   item: T, 
   search?: string, 
   matchCriteria?: string[]): boolean;
```

Defined in: [redux/filterSlice.ts:91](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/redux/filterSlice.ts#L91)

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
| `search?` | `string` | - |
| `matchCriteria?` | `string`[] | The JSONPath criteria to match. |

## Returns

`boolean`
