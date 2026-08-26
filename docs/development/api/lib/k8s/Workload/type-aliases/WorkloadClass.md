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
  | typeof JobSet
  | typeof LeaderWorkerSet;
```

Defined in: [lib/k8s/Workload.ts:45](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/Workload.ts#L45)
