# Function: getTopCondition()

```ts
function getTopCondition(conditions: ConditionLike[] | null | undefined, priority: readonly string[]): string | undefined;
```

Defined in: [lib/k8s/conditions.ts:51](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/conditions.ts#L51)

Picks the single most meaningful met condition to show in a list column.

A resource can report several conditions as met at once, and their order in
`status.conditions` is not guaranteed, so showing the first one makes the
column flicker between equally true values. `priority` lists condition types
most significant first, and the earliest match in it wins; a met condition
absent from `priority` is only used when nothing in `priority` matches.

Returns `undefined` when no condition is met, leaving the display fallback to
the caller.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `conditions` | [`ConditionLike`](../type-aliases/ConditionLike.md)[] \| `null` \| `undefined` |
| `priority` | readonly `string`[] |

## Returns

`string` \| `undefined`
