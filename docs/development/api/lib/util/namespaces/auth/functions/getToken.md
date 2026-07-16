# Function: getToken()

```ts
function getToken(cluster: string): string | undefined;
```

Defined in: [lib/auth.ts:38](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/auth.ts#L38)

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

`string` \| `undefined`

The authentication token for the specified cluster, or undefined if not set.
