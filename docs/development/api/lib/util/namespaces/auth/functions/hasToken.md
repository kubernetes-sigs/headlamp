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

[src/lib/auth.ts:68](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/auth.ts#L68)
