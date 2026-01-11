# Function: combineClusterListErrors()

```ts
function combineClusterListErrors(...args: (null | object)[]): object | null
```

Combines errors per cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| ...`args` | (`null` \| `object`)[] | The list of errors per cluster to join. |

## Returns

`object` \| `null`

The joint list of errors, or null if there are no errors.

## Defined in

[src/lib/util.ts:234](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/util.ts#L234)
