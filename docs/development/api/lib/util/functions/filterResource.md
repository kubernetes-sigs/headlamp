# Function: filterResource()

```ts
function filterResource(
   item: 
  | KubeObjectInterface
  | KubeEvent, 
   filter: FilterState, 
   search?: string, 
   matchCriteria?: string[]): boolean;
```

Defined in: [redux/filterSlice.ts:44](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/filterSlice.ts#L44)

Filters a resource based on the filter state.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `item` | \| [`KubeObjectInterface`](../../k8s/KubeObject/interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../k8s/event/interfaces/KubeEvent.md) | The item to filter. |
| `filter` | `FilterState` | The filter state. |
| `search?` | `string` | - |
| `matchCriteria?` | `string`[] | The JSONPath criteria to match. |

## Returns

`boolean`

True if the item matches the filter, false otherwise.
