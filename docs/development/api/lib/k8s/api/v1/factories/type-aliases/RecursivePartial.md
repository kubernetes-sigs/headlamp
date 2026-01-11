# Type Alias: RecursivePartial\<T\>

```ts
type RecursivePartial<T>: { [P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object | undefined ? RecursivePartial<T[P]> : T[P] };
```

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Defined in

[src/lib/k8s/api/v1/factories.ts:49](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L49)
