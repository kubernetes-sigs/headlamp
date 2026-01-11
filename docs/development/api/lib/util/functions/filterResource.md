# Function: filterResource()

```ts
function filterResource(
   item: KubeObjectInterface | KubeEvent, 
   filter: FilterState, 
   search?: string, 
   matchCriteria?: string[]): boolean
```

Filters a resource based on the filter state.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `item` | [`KubeObjectInterface`](../../k8s/KubeObject/interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../k8s/event/interfaces/KubeEvent.md) | The item to filter. |
| `filter` | `FilterState` | The filter state. |
| `search`? | `string` | - |
| `matchCriteria`? | `string`[] | The JSONPath criteria to match. |

## Returns

`boolean`

True if the item matches the filter, false otherwise.

## Defined in

[src/redux/filterSlice.ts:43](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/redux/filterSlice.ts#L43)
