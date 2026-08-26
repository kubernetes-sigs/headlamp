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

Defined in: [lib/k8s/crdSpec.ts:79](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/crdSpec.ts#L79)

Result returned by `validateCRDSpec`. Discriminated on `ok` so callers can
pattern-match without separately inspecting `missing.length`.
