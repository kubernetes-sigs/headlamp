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

[src/lib/auth.ts:131](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/auth.ts#L131)
