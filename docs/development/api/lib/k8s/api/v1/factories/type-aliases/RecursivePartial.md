# Type Alias: RecursivePartial\<T\>

```ts
type RecursivePartial<T> = { [P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object | undefined ? RecursivePartial<T[P]> : T[P] };
```

Defined in: [lib/k8s/api/v1/factories.ts:49](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L49)

## Type Parameters

| Type Parameter |
| ------ |
| `T` |
