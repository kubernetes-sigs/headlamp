# Function: matchExpressionSimplifier()

```ts
function matchExpressionSimplifier(matchExpressions: object[] | undefined): "" | string[];
```

Defined in: [lib/k8s/index.ts:215](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/index.ts#L215)

Simplifies a matchExpressions array into an array of string representations.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `matchExpressions` | `object`[] \| `undefined` | the matchExpressionss array from a LabelSelector. |

## Returns

`""` \| `string`[]

an array of simplified expression strings, or an empty string.
