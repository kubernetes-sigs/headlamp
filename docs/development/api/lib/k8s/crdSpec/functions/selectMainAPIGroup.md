# Function: selectMainAPIGroup()

```ts
function selectMainAPIGroup(spec: CRDSpecLike | undefined): [string, string, string] | null;
```

Defined in: [lib/k8s/crdSpec.ts:152](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/crdSpec.ts#L152)

Resolves `[group, version, plural]` from a CRD spec, or returns `null` when
the spec is incomplete. Prefer the storage version, fall back to the first
served version; honor `spec.version` (the v1beta1 single-version field)
when `spec.versions` is empty, or when it matches a served entry there.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `spec` | [`CRDSpecLike`](../interfaces/CRDSpecLike.md) \| `undefined` |

## Returns

\[`string`, `string`, `string`\] \| `null`
