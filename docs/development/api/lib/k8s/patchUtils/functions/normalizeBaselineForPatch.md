# Function: normalizeBaselineForPatch()

```ts
function normalizeBaselineForPatch(obj: KubeObjectInterface): KubeObjectInterface;
```

Defined in: [lib/k8s/patchUtils.ts:71](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/patchUtils.ts#L71)

Returns a clone of the given resource with `metadata.managedFields` stripped.

`EditorDialog` hides `metadata.managedFields` by default (the
`hideManagedFields` localStorage flag defaults to `true`). The object the
user saves therefore typically omits `managedFields` even when no edits
were made. If the original baseline still has them, the JSON diff will
contain a `remove /metadata/managedFields` op for an unchanged save.

Strip them up front so the baseline matches what the editor presents to
the user, and "open + save without changes" produces a true empty diff.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `obj` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

## Returns

[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)
