# Function: matchLabelsSimplifier()

```ts
function matchLabelsSimplifier(matchLabels: 
  | {
[key: string]: string;
}
  | undefined, isEqualSeperator?: boolean): "" | string[];
```

Defined in: [lib/k8s/index.ts:189](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/index.ts#L189)

Simplifies a matchLabels object into an array of string expressions.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `matchLabels` | \| \{ \[`key`: `string`\]: `string`; \} \| `undefined` | `undefined` | the matchLabels object from a LabelSelector. |
| `isEqualSeperator` | `boolean` | `false` | whether to use "=" as the separator instead of ":". |

## Returns

`""` \| `string`[]

an array of simplified label strings, or an empty string.
