# Interface: DeleteParameters

Defined in: [lib/k8s/api/v1/deleteParameters.ts:23](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/deleteParameters.ts#L23)

DeleteParamaters is a map of delete parameters for the Kubernetes API.

## Properties

### dryRun?

```ts
optional dryRun?: string;
```

Defined in: [lib/k8s/api/v1/deleteParameters.ts:31](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/deleteParameters.ts#L31)

dryRun causes apiserver to simulate the request, and report whether the object would be modified.
Can be '' or 'All'

#### See

https://kubernetes.io/docs/reference/using-api/api-concepts/#dry-run

***

### gracePeriodSeconds?

```ts
optional gracePeriodSeconds?: number;
```

Defined in: [lib/k8s/api/v1/deleteParameters.ts:24](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/deleteParameters.ts#L24)

***

### propagationPolicy?

```ts
optional propagationPolicy?: "Foreground" | "Background" | "Orphan";
```

Defined in: [lib/k8s/api/v1/deleteParameters.ts:32](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/deleteParameters.ts#L32)
