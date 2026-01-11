# Function: deleteCluster()

```ts
function deleteCluster(
   cluster: string, 
   removeKubeConfig?: boolean, 
   clusterID?: string, 
   kubeconfigOrigin?: string, 
originalName?: string): Promise<object>
```

deleteCluster sends call to backend remove a cluster from the config.

Note: Currently, the use for the optional clusterID is only for the clusterID for non-dynamic clusters.
It is not needed or used for dynamic clusters.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` |  |
| `removeKubeConfig`? | `boolean` | Whether to remove the kubeconfig file associated with the cluster |
| `clusterID`? | `string` |  |
| `kubeconfigOrigin`? | `string` | - |
| `originalName`? | `string` | - |

## Returns

`Promise`\<`object`\>

### clusters

```ts
clusters: ConfigState["clusters"];
```

## Defined in

[src/lib/k8s/api/v1/clusterApi.ts:105](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterApi.ts#L105)
