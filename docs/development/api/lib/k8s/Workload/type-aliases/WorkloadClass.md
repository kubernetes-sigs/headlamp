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

Defined in: [lib/k8s/Workload.ts:45](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/Workload.ts#L45)
