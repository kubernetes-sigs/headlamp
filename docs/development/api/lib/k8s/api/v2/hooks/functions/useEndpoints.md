# Function: useEndpoints()

```ts
function useEndpoints(
   endpoints: KubeObjectEndpoint[], 
   cluster: string, 
   namespace?: string, 
   name?: string): object;
```

Defined in: [lib/k8s/api/v2/hooks.ts:277](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/hooks.ts#L277)

Returns a working endpoint for the given resource.

It tries to find a working endpoint by probing the provided list.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `endpoints` | [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md)[] | List of possible endpoints |
| `cluster` | `string` | Cluster name |
| `namespace?` | `string` | Optional namespace scope |
| `name?` | `string` | Resource name. When provided, uses GET-by-name probing |

## Returns

`object`

### endpoint

```ts
endpoint: 
  | KubeObjectEndpoint
  | undefined;
```

### error

```ts
error: ApiError | null;
```
