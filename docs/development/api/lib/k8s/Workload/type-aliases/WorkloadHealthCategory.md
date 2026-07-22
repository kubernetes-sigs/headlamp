# Type Alias: WorkloadHealthCategory

```ts
type WorkloadHealthCategory = "healthy" | "degraded" | "transitional" | "failed";
```

Defined in: [lib/k8s/Workload.ts:32](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/Workload.ts#L32)

Coarse health category for a workload item, used by the Workloads overview
chart. Replica-based workloads only use the binary healthy/failed distinction,
but item-based workloads (Pods) also need to tell genuine failures apart from
transitional states (Pending, Terminating) and degraded-but-running items.
