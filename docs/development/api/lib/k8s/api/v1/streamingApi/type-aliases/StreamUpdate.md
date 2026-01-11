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

[src/lib/k8s/api/v1/streamingApi.ts:36](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/streamingApi.ts#L36)
