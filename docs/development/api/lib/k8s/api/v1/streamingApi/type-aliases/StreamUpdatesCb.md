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

[src/lib/k8s/api/v1/streamingApi.ts:42](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/streamingApi.ts#L42)
