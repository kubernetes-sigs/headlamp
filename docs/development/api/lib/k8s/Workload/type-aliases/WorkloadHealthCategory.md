# Type Alias: WorkloadHealthCategory

```ts
type WorkloadHealthCategory = "healthy" | "degraded" | "transitional" | "failed";
```

Defined in: [lib/k8s/Workload.ts:33](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/Workload.ts#L33)

Coarse health category for a workload item, used by the Workloads overview
chart. Replica-based workloads only use the binary healthy/failed distinction,
but item-based workloads (Pods) also need to tell genuine failures apart from
transitional states (Pending, Terminating) and degraded-but-running items.
