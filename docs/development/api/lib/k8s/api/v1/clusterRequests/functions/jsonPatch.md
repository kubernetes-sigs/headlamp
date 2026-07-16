# Function: jsonPatch()

```ts
function jsonPatch(
   url: string, 
   operations: OpPatch[], 
   autoLogoutOnAuthError?: boolean, 
options?: ClusterRequestParams): Promise<any>;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:289](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L289)

Performs a JSON Patch (RFC 6902) request.
This is different from the merge patch above - it uses 'application/json-patch+json'
content type and expects an array of patch operations.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `url` | `string` | `undefined` | The URL to patch. |
| `operations` | `OpPatch`[] | `undefined` | Array of JSON Patch operations (e.g., [{op: 'replace', path: '/spec/template', value: {...}}]). |
| `autoLogoutOnAuthError` | `boolean` | `true` | Whether to automatically log out on auth errors. |
| `options` | [`ClusterRequestParams`](../interfaces/ClusterRequestParams.md) | `{}` | Additional request options. |

## Returns

`Promise`\<`any`\>

A Promise that resolves to the patched resource.
