# Type Alias: StreamUpdatesCb\<T\>

```ts
type StreamUpdatesCb<T> = (data: T | StreamUpdate<T>) => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:42](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/streamingApi.ts#L42)

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
