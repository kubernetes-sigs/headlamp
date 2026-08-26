# Type Alias: CRDValidation

```ts
type CRDValidation = 
  | {
  missing: [];
  ok: true;
  usableVersions: UsableCRDVersion[];
}
  | {
  missing: MissingFieldId[];
  ok: false;
  usableVersions: UsableCRDVersion[];
};
```

Defined in: [lib/k8s/crdSpec.ts:79](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/crdSpec.ts#L79)

Result returned by `validateCRDSpec`. Discriminated on `ok` so callers can
pattern-match without separately inspecting `missing.length`.
