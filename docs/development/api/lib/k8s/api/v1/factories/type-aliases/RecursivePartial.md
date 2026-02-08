# Type Alias: RecursivePartial\<T\>

```ts
type RecursivePartial<T>: { [P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object | undefined ? RecursivePartial<T[P]> : T[P] };
```

## Type Parameters

| Type Parameter |
| ------ |
| `T` |

## Defined in

[src/lib/k8s/api/v1/factories.ts:49](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/factories.ts#L49)
