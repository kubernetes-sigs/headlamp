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

[src/lib/k8s/Workload.ts:25](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/Workload.ts#L25)
