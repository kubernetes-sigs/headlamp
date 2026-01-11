# Function: getUserInfo()

```ts
function getUserInfo(cluster: string): any
```

Retrieves the user information encoded in the authentication token for a given cluster.

Important! This will only work if plugins have overriden getToken function!
By default tokens are stored in httpOnly cookies and not available from JS

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The name of the cluster. |

## Returns

`any`

The decoded user information from the token's payload.

## Defined in

[src/lib/auth.ts:52](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/auth.ts#L52)
