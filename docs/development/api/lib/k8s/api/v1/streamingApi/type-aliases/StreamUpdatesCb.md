# Type Alias: StreamUpdatesCb\<T\>

```ts
type StreamUpdatesCb<T> = (data: T | StreamUpdate<T>) => void;
```

Defined in: [lib/k8s/api/v1/streamingApi.ts:42](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/streamingApi.ts#L42)

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
