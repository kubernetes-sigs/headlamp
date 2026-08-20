# Function: matchExpressionSimplifier()

```ts
function matchExpressionSimplifier(matchExpressions: object[] | undefined): "" | string[];
```

Defined in: [lib/k8s/index.ts:205](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/index.ts#L205)

Simplifies a matchExpressions array into an array of string representations.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `matchExpressions` | `object`[] \| `undefined` | the matchExpressionss array from a LabelSelector. |

## Returns

`""` \| `string`[]

an array of simplified expression strings, or an empty string.
