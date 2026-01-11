# Function: getToken()

```ts
function getToken(cluster: string): undefined | string
```

Retrieves the authentication token for a given cluster.
If a custom getToken method is defined in the Redux store, it will be used.
Otherwise, the token is retrieved from local storage.

Important! This will only work if plugins have overriden getToken function!
By default tokens are stored in httpOnly cookies and not available from JS

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The name of the cluster. |

## Returns

`undefined` \| `string`

The authentication token for the specified cluster, or undefined if not set.

## Defined in

[src/lib/auth.ts:37](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/auth.ts#L37)
