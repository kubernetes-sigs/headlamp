# Function: deleteCluster()

```ts
function deleteCluster(
   cluster: string, 
   removeKubeConfig?: boolean, 
   clusterID?: string, 
   kubeconfigOrigin?: string, 
   originalName?: string): Promise<{
  clusters:   | {
   [clusterName: string]: Cluster;
   }
     | null;
}>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:182](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/clusterApi.ts#L182)

deleteCluster sends call to backend remove a cluster from the config.

Note: Currently, the use for the optional clusterID is only for the clusterID for non-dynamic clusters.
It is not needed or used for dynamic clusters.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | - |
| `removeKubeConfig?` | `boolean` | Whether to remove the kubeconfig file associated with the cluster |
| `clusterID?` | `string` | - |
| `kubeconfigOrigin?` | `string` | - |
| `originalName?` | `string` | - |

## Returns

`Promise`\<\{
  `clusters`:   \| \{
   \[`clusterName`: `string`\]: [`Cluster`](../../../../cluster/interfaces/Cluster.md);
   \}
     \| `null`;
\}\>
