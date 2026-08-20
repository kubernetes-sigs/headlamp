# lib/k8s/crdSpec

## Interfaces

| Interface | Description |
| ------ | ------ |
| [CRDApiGroupSource](interfaces/CRDApiGroupSource.md) | Duck-typed surface a CRD instance might expose. New in-tree code has both methods; older plugin bundles only ship `getMainAPIGroup()`. |
| [CRDSpecLike](interfaces/CRDSpecLike.md) | Subset of the `KubeCRD['spec']` shape that the helpers below depend on. Lives in this standalone module so the helpers can be imported (and unit tested) without pulling in `lib/k8s/index.ts`, which transitively loads every built-in resource class and creates a circular import that vitest cannot resolve in isolation. |
| [CRDVersionLike](interfaces/CRDVersionLike.md) | Subset of a CRD `spec.versions[i]` entry used by the helpers. All fields are optional because partial watch updates can deliver a half-populated entry; the validation logic decides what counts as usable. |
| [UsableCRDVersion](interfaces/UsableCRDVersion.md) | Strongly typed "valid" subset of a usable version entry. `validateCRDSpec` narrows the array elements to this shape after the served+name filter. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [CRDValidation](type-aliases/CRDValidation.md) | Result returned by `validateCRDSpec`. Discriminated on `ok` so callers can pattern-match without separately inspecting `missing.length`. |
| [MissingFieldId](type-aliases/MissingFieldId.md) | Identifiers that `validateCRDSpec` can produce in its `missing` array. Typing this as a literal union (rather than `string`) lets `describeMissingField` exhaustively switch over the set: any future identifier added here without a matching `case` becomes a compile error, so the user-facing error message can never accidentally surface a raw sentinel string. |

## Functions

| Function | Description |
| ------ | ------ |
| [describeMissingField](functions/describeMissingField.md) | Maps a `validateCRDSpec` missing-field identifier to a human-readable phrase suitable for error messages and UI labels. Internal identifiers like `versions[].name+served` are fine for programmatic checks but unhelpful when they surface in user-facing diagnostics. |
| [resolveCRDApiGroup](functions/resolveCRDApiGroup.md) | Resolves `[group, version, plural]` from either the new or the legacy surface on a CRD instance, returning `null` when neither yields a usable identity. Plugin bundles ship their own copy of this module's code, so a plugin built before `getMainAPIGroupOrNull()` existed will not have the method on its CRD instance at runtime. We duck-type the call rather than assume the new API is present, and we route both surfaces through the same tuple validator so an all-empty sentinel or a missing version component is treated as "no usable identity" on either path. |
| [selectMainAPIGroup](functions/selectMainAPIGroup.md) | Resolves `[group, version, plural]` from a CRD spec, or returns `null` when the spec is incomplete. Prefer the storage version, fall back to the first served version; honor `spec.version` (the v1beta1 single-version field) when `spec.versions` is empty, or when it matches a served entry there. |
| [validateCRDSpec](functions/validateCRDSpec.md) | Validates a CRD spec and returns the list of missing required fields plus the subset of version entries that are usable (named and served). |
