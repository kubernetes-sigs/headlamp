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

[src/lib/util.ts:234](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/util.ts#L234)
