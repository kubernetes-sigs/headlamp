# Function: computePatchOperations()

```ts
function computePatchOperations(original: KubeObjectInterface, modified: KubeObjectInterface): OpPatch[];
```

Defined in: [lib/k8s/patchUtils.ts:51](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/patchUtils.ts#L51)

Computes RFC 6902 JSON Patch operations between two resource objects,
filtering out server-managed fields (resourceVersion, managedFields,
generation, status) which the server manages and would reintroduce
the 409 conflict the patch is meant to avoid.

Also filters non-standard operations (e.g. fast-json-patch's `_get`)
to ensure only valid RFC 6902 ops are sent to the API server.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `original` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |
| `modified` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

## Returns

`OpPatch`[]
