# Function: matchExpressionSimplifier()

```ts
function matchExpressionSimplifier(matchExpressions: object[] | undefined): "" | string[];
```

Defined in: [lib/k8s/index.ts:203](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/index.ts#L203)

Simplifies a matchExpressions array into an array of string representations.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `matchExpressions` | `object`[] \| `undefined` | the matchExpressionss array from a LabelSelector. |

## Returns

`""` \| `string`[]

an array of simplified expression strings, or an empty string.
