# Type Alias: StreamUpdate\<T\>

```ts
type StreamUpdate<T>: object;
```

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` | `any` |

## Type declaration

### object

```ts
object: T;
```

### type

```ts
type: "ADDED" | "MODIFIED" | "DELETED" | "ERROR";
```

## Defined in

[src/lib/k8s/api/v1/streamingApi.ts:36](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/streamingApi.ts#L36)
