# Function: matchLabelsSimplifier()

```ts
function matchLabelsSimplifier(matchLabels: 
  | {
[key: string]: string;
}
  | undefined, isEqualSeperator?: boolean): "" | string[];
```

Defined in: [lib/k8s/index.ts:177](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/index.ts#L177)

Simplifies a matchLabels object into an array of string expressions.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `matchLabels` | \| \{ \[`key`: `string`\]: `string`; \} \| `undefined` | `undefined` | the matchLabels object from a LabelSelector. |
| `isEqualSeperator` | `boolean` | `false` | whether to use "=" as the separator instead of ":". |

## Returns

`""` \| `string`[]

an array of simplified label strings, or an empty string.
