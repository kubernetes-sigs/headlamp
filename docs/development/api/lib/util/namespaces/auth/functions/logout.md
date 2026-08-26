# Function: logout()

```ts
function logout(cluster: string): Promise<void>;
```

Defined in: [lib/auth.ts:140](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/auth.ts#L140)

Logs out the user by clearing the authentication token for the specified cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The name of the cluster to log out from. |

## Returns

`Promise`\<`void`\>

## Throws

When logout request fails
