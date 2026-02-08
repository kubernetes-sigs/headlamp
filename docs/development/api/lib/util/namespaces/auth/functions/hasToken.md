# Function: hasToken()

```ts
function hasToken(cluster: string): boolean
```

Checks whether an authentication token exists for the given cluster.

Important! This will only work if plugins have overriden getToken function!
By default tokens are stored in httpOnly cookies and not available from JS

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | The name of the cluster. |

## Returns

`boolean`

True if a token exists, false otherwise.

## Defined in

[src/lib/auth.ts:68](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/auth.ts#L68)
