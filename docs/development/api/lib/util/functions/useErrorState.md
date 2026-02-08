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

[src/lib/util.ts:196](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/util.ts#L196)
