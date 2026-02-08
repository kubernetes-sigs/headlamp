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

[src/lib/k8s/Workload.ts:26](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/Workload.ts#L26)
