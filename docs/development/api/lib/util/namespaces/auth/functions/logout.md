# Function: logout()

```ts
function logout(cluster: string): Promise<void>;
```

Defined in: [lib/auth.ts:140](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/auth.ts#L140)

Logs out the user by clearing the authentication token for the specified cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The name of the cluster to log out from. |

## Returns

`Promise`\<`void`\>

## Throws

When logout request fails
