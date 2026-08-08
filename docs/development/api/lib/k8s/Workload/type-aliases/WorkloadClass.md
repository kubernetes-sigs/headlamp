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

Defined in: [lib/k8s/Workload.ts:43](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/Workload.ts#L43)
