# Type Alias: StreamUpdatesCb()\<T\>

```ts
type StreamUpdatesCb<T>: (data: T | StreamUpdate<T>) => void;
```

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

## Defined in

[src/lib/k8s/api/v1/streamingApi.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L42)
