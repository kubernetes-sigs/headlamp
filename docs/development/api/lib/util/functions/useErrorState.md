# Function: useErrorState()

```ts
function useErrorState(dependentSetter?: (...args: any) => void): readonly [ApiError | null, Dispatch<SetStateAction<ApiError | null>>];
```

Defined in: [lib/util.ts:334](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/util.ts#L334)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `dependentSetter?` | (...`args`: `any`) => `void` |

## Returns

readonly \[[`ApiError`](../../k8s/api/v2/ApiError/classes/ApiError.md) \| `null`, `Dispatch`\<`SetStateAction`\<[`ApiError`](../../k8s/api/v2/ApiError/classes/ApiError.md) \| `null`\>\>\]
