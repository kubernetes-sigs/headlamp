# Function: setToken()

```ts
function setToken(cluster: string, token: string | null): Promise<void> | Promise<boolean>;
```

Defined in: [lib/auth.ts:117](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/auth.ts#L117)

Sets or updates the token for a given cluster using cookie-based storage.
The token is stored securely in an HttpOnly cookie on the backend.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The name of the cluster. |
| `token` | `string` \| `null` | The authentication token to set. Pass null to clear the token. |

## Returns

`Promise`\<`void`\> \| `Promise`\<`boolean`\>

## Throws

When cluster name is invalid or backend request fails
