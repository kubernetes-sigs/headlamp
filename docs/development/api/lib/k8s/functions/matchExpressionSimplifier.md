# Function: matchExpressionSimplifier()

```ts
function matchExpressionSimplifier(matchExpressions: object[] | undefined): "" | string[];
```

Defined in: [lib/k8s/index.ts:217](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/index.ts#L217)

Simplifies a matchExpressions array into an array of string representations.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `matchExpressions` | `object`[] \| `undefined` | the matchExpressionss array from a LabelSelector. |

## Returns

`""` \| `string`[]

an array of simplified expression strings, or an empty string.
