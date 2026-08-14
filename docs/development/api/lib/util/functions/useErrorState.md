# Function: useErrorState()

```ts
function useErrorState(dependentSetter?: (...args: any) => void): readonly [ApiError | null, Dispatch<SetStateAction<ApiError | null>>];
```

Defined in: [lib/util.ts:334](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/util.ts#L334)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `dependentSetter?` | (...`args`: `any`) => `void` |

## Returns

readonly \[[`ApiError`](../../k8s/api/v2/ApiError/classes/ApiError.md) \| `null`, `Dispatch`\<`SetStateAction`\<[`ApiError`](../../k8s/api/v2/ApiError/classes/ApiError.md) \| `null`\>\>\]
