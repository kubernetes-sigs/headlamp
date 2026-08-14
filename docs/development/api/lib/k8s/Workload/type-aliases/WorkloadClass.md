# Type Alias: WorkloadClass

```ts
type WorkloadClass = 
  | typeof Pod
  | typeof DaemonSet
  | typeof ReplicaSet
  | typeof StatefulSet
  | typeof Job
  | typeof CronJob
  | typeof Deployment
  | typeof JobSet;
```

Defined in: [lib/k8s/Workload.ts:43](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/Workload.ts#L43)
