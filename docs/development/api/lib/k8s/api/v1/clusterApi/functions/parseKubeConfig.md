# Function: parseKubeConfig()

```ts
function parseKubeConfig(clusterReq: ClusterRequest): Promise<any>
```

parseKubeConfig sends call to backend to parse kubeconfig and send back
the parsed clusters and contexts.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusterReq` | [`ClusterRequest`](../../clusterRequests/interfaces/ClusterRequest.md) | The cluster request object. |

## Returns

`Promise`\<`any`\>

## Defined in

[src/lib/k8s/api/v1/clusterApi.ts:236](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterApi.ts#L236)
