# Interface: DeleteParameters

DeleteParamaters is a map of delete parameters for the Kubernetes API.

## Properties

### dryRun?

```ts
optional dryRun: string;
```

dryRun causes apiserver to simulate the request, and report whether the object would be modified.
Can be '' or 'All'

#### See

https://kubernetes.io/docs/reference/using-api/api-concepts/#dry-run

#### Defined in

[src/lib/k8s/api/v1/deleteParameters.ts:31](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/deleteParameters.ts#L31)

***

### gracePeriodSeconds?

```ts
optional gracePeriodSeconds: number;
```

#### Defined in

[src/lib/k8s/api/v1/deleteParameters.ts:24](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/deleteParameters.ts#L24)
