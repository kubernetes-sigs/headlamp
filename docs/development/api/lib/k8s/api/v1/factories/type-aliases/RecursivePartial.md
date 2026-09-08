# Type Alias: RecursivePartial\<T\>

```ts
type RecursivePartial<T> = { [P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object | undefined ? RecursivePartial<T[P]> : T[P] };
```

Defined in: [lib/k8s/api/v1/factories.ts:49](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/factories.ts#L49)

## Type Parameters

| Type Parameter |
| ------ |
| `T` |
