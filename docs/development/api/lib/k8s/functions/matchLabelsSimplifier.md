# Function: matchLabelsSimplifier()

```ts
function matchLabelsSimplifier(matchLabels: 
  | {
[key: string]: string;
}
  | undefined, isEqualSeperator?: boolean): "" | string[];
```

Defined in: [lib/k8s/index.ts:191](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/index.ts#L191)

Simplifies a matchLabels object into an array of string expressions.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `matchLabels` | \| \{ \[`key`: `string`\]: `string`; \} \| `undefined` | `undefined` | the matchLabels object from a LabelSelector. |
| `isEqualSeperator` | `boolean` | `false` | whether to use "=" as the separator instead of ":". |

## Returns

`""` \| `string`[]

an array of simplified label strings, or an empty string.
