# Function: renameCluster()

```ts
function renameCluster(
   cluster: string, 
   newClusterName: string, 
   source: string, 
clusterID?: string): Promise<any>
```

renameCluster sends call to backend to update a field in kubeconfig which
is the custom name of the cluster used by the user.

Note: Currently, the use for the optional clusterID is only for the clusterID for non-dynamic clusters.
It is not needed or used for dynamic clusters.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` |  |
| `newClusterName` | `string` |  |
| `source` | `string` |  |
| `clusterID`? | `string` |  |

## Returns

`Promise`\<`any`\>

## Defined in

[src/lib/k8s/api/v1/clusterApi.ts:193](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterApi.ts#L193)
