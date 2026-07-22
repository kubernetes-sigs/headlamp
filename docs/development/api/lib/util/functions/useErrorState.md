# Function: useErrorState()

```ts
function useErrorState(dependentSetter?: (...args: any) => void): readonly [ApiError | null, Dispatch<SetStateAction<ApiError | null>>];
```

Defined in: [lib/util.ts:334](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/util.ts#L334)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `dependentSetter?` | (...`args`: `any`) => `void` |

## Returns

readonly \[[`ApiError`](../../k8s/api/v2/ApiError/classes/ApiError.md) \| `null`, `Dispatch`\<`SetStateAction`\<[`ApiError`](../../k8s/api/v2/ApiError/classes/ApiError.md) \| `null`\>\>\]
