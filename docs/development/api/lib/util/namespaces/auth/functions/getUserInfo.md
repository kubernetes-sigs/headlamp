# Function: getUserInfo()

```ts
function getUserInfo(cluster: string): Record<string, unknown> | null;
```

Defined in: [lib/auth.ts:53](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/auth.ts#L53)

Retrieves the user information encoded in the authentication token for a given cluster.

Important! This will only work if plugins have overriden getToken function!
By default tokens are stored in httpOnly cookies and not available from JS

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The name of the cluster. |

## Returns

`Record`\<`string`, `unknown`\> \| `null`

The decoded user information from the token's payload, or null if the token is invalid or missing.
