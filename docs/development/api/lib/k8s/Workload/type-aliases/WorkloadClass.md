# Type Alias: WorkloadClass

```ts
type WorkloadClass: 
  | typeof Pod
  | typeof DaemonSet
  | typeof ReplicaSet
  | typeof StatefulSet
  | typeof Job
  | typeof CronJob
  | typeof Deployment;
```

## Defined in

[src/lib/k8s/Workload.ts:26](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/Workload.ts#L26)
