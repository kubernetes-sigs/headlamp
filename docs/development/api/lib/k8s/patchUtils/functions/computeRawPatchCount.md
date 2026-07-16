# Function: computeRawPatchCount()

```ts
function computeRawPatchCount(original: KubeObjectInterface, modified: KubeObjectInterface): number;
```

Defined in: [lib/k8s/patchUtils.ts:88](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/patchUtils.ts#L88)

Returns the total number of raw diff operations between two objects,
ignoring `/metadata/managedFields` diffs (which are produced as a
side-effect of `EditorDialog`'s default "Hide Managed Fields" rendering
and do not represent user-intent changes).

Used to distinguish "no changes at all" from "all changes were in
server-managed fields".

## Parameters

| Parameter | Type |
| ------ | ------ |
| `original` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |
| `modified` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

## Returns

`number`
