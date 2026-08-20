# Type Alias: RecursivePartial\<T\>

```ts
type RecursivePartial<T> = { [P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object | undefined ? RecursivePartial<T[P]> : T[P] };
```

Defined in: [lib/k8s/api/v1/factories.ts:49](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/factories.ts#L49)

## Type Parameters

| Type Parameter |
| ------ |
| `T` |
