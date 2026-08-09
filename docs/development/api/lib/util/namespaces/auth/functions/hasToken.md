# Function: hasToken()

```ts
function hasToken(cluster: string): boolean;
```

Defined in: [lib/auth.ts:77](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/auth.ts#L77)

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
