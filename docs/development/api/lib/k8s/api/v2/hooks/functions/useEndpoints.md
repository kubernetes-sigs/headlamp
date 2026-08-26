# Function: useEndpoints()

```ts
function useEndpoints(
   endpoints: KubeObjectEndpoint[], 
   cluster: string, 
   namespace?: string, 
   name?: string): object;
```

Defined in: [lib/k8s/api/v2/hooks.ts:290](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/hooks.ts#L290)

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
