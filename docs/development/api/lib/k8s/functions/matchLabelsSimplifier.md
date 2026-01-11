# Function: matchLabelsSimplifier()

```ts
function matchLabelsSimplifier(matchLabels: undefined | object, isEqualSeperator: boolean): string[] | ""
```

Simplifies a matchLabels object into an array of string expressions.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `matchLabels` | `undefined` \| `object` | `undefined` | the matchLabels object from a LabelSelector. |
| `isEqualSeperator` | `boolean` | `false` | whether to use "=" as the separator instead of ":". |

## Returns

`string`[] \| `""`

an array of simplified label strings, or an empty string.

## Defined in

[src/lib/k8s/index.ts:245](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/index.ts#L245)
