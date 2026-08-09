# Type Alias: StreamUpdatesCb\<T\>

```ts
type StreamUpdatesCb<T> = (data: T | StreamUpdate<T>) => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:42](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/streamingApi.ts#L42)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `any` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `T` \| [`StreamUpdate`](StreamUpdate.md)\<`T`\> |

## Returns

`void`
