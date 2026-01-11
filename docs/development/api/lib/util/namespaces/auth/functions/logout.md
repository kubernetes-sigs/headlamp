# Function: logout()

```ts
function logout(cluster: string): Promise<void>
```

Logs out the user by clearing the authentication token for the specified cluster.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The name of the cluster to log out from. |

## Returns

`Promise`\<`void`\>

## Throws

When logout request fails

## Defined in

[src/lib/auth.ts:131](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/auth.ts#L131)
