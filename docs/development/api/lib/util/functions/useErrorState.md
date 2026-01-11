# Function: useErrorState()

```ts
function useErrorState(dependentSetter?: (...args: any) => void): readonly [null | ApiError, Dispatch<SetStateAction<null | ApiError>>]
```

## Parameters

| Parameter | Type |
| ------ | ------ |
| `dependentSetter`? | (...`args`: `any`) => `void` |

## Returns

readonly [`null` \| [`ApiError`](../../k8s/api/v2/ApiError/classes/ApiError.md), `Dispatch`\<`SetStateAction`\<`null` \| [`ApiError`](../../k8s/api/v2/ApiError/classes/ApiError.md)\>\>]

## Defined in

[src/lib/util.ts:196](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/util.ts#L196)
