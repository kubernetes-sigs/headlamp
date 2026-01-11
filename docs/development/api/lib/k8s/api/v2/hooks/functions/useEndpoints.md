# Function: useEndpoints()

```ts
function useEndpoints(
   endpoints: KubeObjectEndpoint[], 
   cluster: string, 
   namespace?: string): object
```

Checks and returns an endpoint that works from the list

## Parameters

| Parameter | Type |
| ------ | ------ |
| `endpoints` | [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md)[] |
| `cluster` | `string` |
| `namespace`? | `string` |

## Returns

`object`

### endpoint

```ts
endpoint: undefined | KubeObjectEndpoint;
```

### error

```ts
error: null | ApiError;
```

## Params

endpoints - List of possible endpoints

## Defined in

[src/lib/k8s/api/v2/hooks.ts:247](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/hooks.ts#L247)
