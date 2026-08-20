# Type Alias: ConditionLike

```ts
type ConditionLike = Pick<KubeCondition, "type" | "status">;
```

Defined in: [lib/k8s/conditions.ts:24](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/conditions.ts#L24)

The part of a status condition these helpers rely on. Kept structural so it
accepts both [KubeCondition](../../cluster/interfaces/KubeCondition.md) and the looser condition types custom
resources declare for themselves.
