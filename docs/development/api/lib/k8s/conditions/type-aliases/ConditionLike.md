# Type Alias: ConditionLike

```ts
type ConditionLike = Pick<KubeCondition, "type" | "status">;
```

Defined in: [lib/k8s/conditions.ts:24](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/conditions.ts#L24)

The part of a status condition these helpers rely on. Kept structural so it
accepts both [KubeCondition](../../cluster/interfaces/KubeCondition.md) and the looser condition types custom
resources declare for themselves.
