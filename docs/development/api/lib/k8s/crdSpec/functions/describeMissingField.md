# Function: describeMissingField()

```ts
function describeMissingField(id: MissingFieldId): string;
```

Defined in: [lib/k8s/crdSpec.ts:127](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L127)

Maps a `validateCRDSpec` missing-field identifier to a human-readable
phrase suitable for error messages and UI labels. Internal identifiers
like `versions[].name+served` are fine for programmatic checks but
unhelpful when they surface in user-facing diagnostics.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | [`MissingFieldId`](../type-aliases/MissingFieldId.md) |

## Returns

`string`
