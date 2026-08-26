# Type Alias: Workload

```ts
type Workload = 
  | Pod
  | DaemonSet
  | ReplicaSet
  | StatefulSet
  | Job
  | CronJob
  | Deployment
  | JobSet
  | LeaderWorkerSet;
```

Defined in: [lib/k8s/Workload.ts:35](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/Workload.ts#L35)
