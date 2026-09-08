# Type Alias: ConditionLike

```ts
type ConditionLike = Pick<KubeCondition, "type" | "status">;
```

Defined in: [lib/k8s/conditions.ts:24](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/conditions.ts#L24)

The part of a status condition these helpers rely on. Kept structural so it
accepts both [KubeCondition](../../cluster/interfaces/KubeCondition.md) and the looser condition types custom
resources declare for themselves.
