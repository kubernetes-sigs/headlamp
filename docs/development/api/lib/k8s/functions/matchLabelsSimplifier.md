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

[src/lib/k8s/index.ts:245](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/index.ts#L245)
