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

Defined in: [lib/k8s/crdSpec.ts:79](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L79)

Result returned by `validateCRDSpec`. Discriminated on `ok` so callers can
pattern-match without separately inspecting `missing.length`.
