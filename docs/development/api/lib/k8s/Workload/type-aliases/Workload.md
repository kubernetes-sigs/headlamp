# Type Alias: Workload

```ts
type Workload: 
  | Pod
  | DaemonSet
  | ReplicaSet
  | StatefulSet
  | Job
  | CronJob
  | Deployment;
```

## Defined in

[src/lib/k8s/Workload.ts:25](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/Workload.ts#L25)
