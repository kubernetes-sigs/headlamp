# Type Alias: MissingFieldId

```ts
type MissingFieldId = 
  | "names.plural"
  | "names.kind"
  | "group"
  | "scope"
  | "scope.invalid"
  | "versions"
  | "versions[].name+served";
```

Defined in: [lib/k8s/crdSpec.ts:66](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L66)

Identifiers that `validateCRDSpec` can produce in its `missing` array.
Typing this as a literal union (rather than `string`) lets
`describeMissingField` exhaustively switch over the set: any future
identifier added here without a matching `case` becomes a compile error,
so the user-facing error message can never accidentally surface a raw
sentinel string.
