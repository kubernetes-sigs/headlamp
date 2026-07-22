# Function: renameCluster()

```ts
function renameCluster(
   cluster: string, 
   newClusterName: string, 
   source: string, 
clusterID?: string): Promise<any>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:270](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterApi.ts#L270)

renameCluster sends call to backend to update a field in kubeconfig which
is the custom name of the cluster used by the user.

Note: Currently, the use for the optional clusterID is only for the clusterID for non-dynamic clusters.
It is not needed or used for dynamic clusters.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | - |
| `newClusterName` | `string` | - |
| `source` | `string` | - |
| `clusterID?` | `string` | - |

## Returns

`Promise`\<`any`\>
