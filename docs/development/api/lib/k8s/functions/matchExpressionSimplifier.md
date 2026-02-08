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

[src/lib/k8s/index.ts:271](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/index.ts#L271)
