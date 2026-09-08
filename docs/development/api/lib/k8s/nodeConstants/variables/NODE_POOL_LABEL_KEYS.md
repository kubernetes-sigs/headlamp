# Variable: NODE\_POOL\_LABEL\_KEYS

```ts
const NODE_POOL_LABEL_KEYS: readonly ["cloud.google.com/gke-nodepool", "kubernetes.azure.com/agentpool", "eks.amazonaws.com/nodegroup", "kops.k8s.io/instancegroup", "cluster.x-k8s.io/deployment-name"];
```

Defined in: [lib/k8s/nodeConstants.ts:23](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/nodeConstants.ts#L23)

The exact label keys checked by Node.getNodePool().

Exported separately so stories, tests, and other consumers can use the
same source of truth without importing the full Node implementation.
