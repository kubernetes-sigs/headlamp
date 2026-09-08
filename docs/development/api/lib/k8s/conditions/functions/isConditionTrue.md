# Function: isConditionTrue()

```ts
function isConditionTrue(conditions: ConditionLike[] | null | undefined, type: string): boolean;
```

Defined in: [lib/k8s/conditions.ts:32](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/conditions.ts#L32)

Whether the given conditions report `type` as met.

A condition is met only when it is present with status `'True'`; both
`'False'` and `'Unknown'` count as not met, as does a missing condition.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `conditions` | [`ConditionLike`](../type-aliases/ConditionLike.md)[] \| `null` \| `undefined` |
| `type` | `string` |

## Returns

`boolean`
