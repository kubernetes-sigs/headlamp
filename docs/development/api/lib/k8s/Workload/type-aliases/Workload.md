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

Defined in: [lib/k8s/Workload.ts:35](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/Workload.ts#L35)
