# Variable: NODE\_POOL\_LABEL\_KEYS

```ts
const NODE_POOL_LABEL_KEYS: readonly ["cloud.google.com/gke-nodepool", "kubernetes.azure.com/agentpool", "eks.amazonaws.com/nodegroup", "kops.k8s.io/instancegroup", "cluster.x-k8s.io/deployment-name"];
```

Defined in: [lib/k8s/nodeConstants.ts:23](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/nodeConstants.ts#L23)

The exact label keys checked by Node.getNodePool().

Exported separately so stories, tests, and other consumers can use the
same source of truth without importing the full Node implementation.
