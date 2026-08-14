# Type Alias: RecursivePartial\<T\>

```ts
type RecursivePartial<T> = { [P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object | undefined ? RecursivePartial<T[P]> : T[P] };
```

Defined in: [lib/k8s/api/v1/factories.ts:49](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/factories.ts#L49)

## Type Parameters

| Type Parameter |
| ------ |
| `T` |
