# lib/k8s/patchUtils

## Functions

| Function | Description |
| ------ | ------ |
| [computePatchOperations](functions/computePatchOperations.md) | Computes RFC 6902 JSON Patch operations between two resource objects, filtering out server-managed fields (resourceVersion, managedFields, generation, status) which the server manages and would reintroduce the 409 conflict the patch is meant to avoid. |
| [computeRawPatchCount](functions/computeRawPatchCount.md) | Returns the total number of raw diff operations between two objects, ignoring `/metadata/managedFields` diffs (which are produced as a side-effect of `EditorDialog`'s default "Hide Managed Fields" rendering and do not represent user-intent changes). |
| [normalizeBaselineForPatch](functions/normalizeBaselineForPatch.md) | Returns a clone of the given resource with `metadata.managedFields` stripped. |
