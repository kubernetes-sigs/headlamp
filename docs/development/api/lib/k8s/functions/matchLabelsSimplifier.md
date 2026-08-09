# Function: matchLabelsSimplifier()

```ts
function matchLabelsSimplifier(matchLabels: 
  | {
[key: string]: string;
}
  | undefined, isEqualSeperator?: boolean): "" | string[];
```

Defined in: [lib/k8s/index.ts:179](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/index.ts#L179)

Simplifies a matchLabels object into an array of string expressions.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `matchLabels` | \| \{ \[`key`: `string`\]: `string`; \} \| `undefined` | `undefined` | the matchLabels object from a LabelSelector. |
| `isEqualSeperator` | `boolean` | `false` | whether to use "=" as the separator instead of ":". |

## Returns

`""` \| `string`[]

an array of simplified label strings, or an empty string.
