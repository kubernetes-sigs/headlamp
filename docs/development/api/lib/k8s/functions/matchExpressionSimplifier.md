# Function: matchExpressionSimplifier()

```ts
function matchExpressionSimplifier(matchExpressions: undefined | object[]): string[] | ""
```

Simplifies a matchExpressions array into an array of string representations.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `matchExpressions` | `undefined` \| `object`[] | the matchExpressionss array from a LabelSelector. |

## Returns

`string`[] \| `""`

an array of simplified expression strings, or an empty string.

## Defined in

[src/lib/k8s/index.ts:271](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/index.ts#L271)
