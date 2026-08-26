# Function: describeMissingField()

```ts
function describeMissingField(id: MissingFieldId): string;
```

Defined in: [lib/k8s/crdSpec.ts:127](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/crdSpec.ts#L127)

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
