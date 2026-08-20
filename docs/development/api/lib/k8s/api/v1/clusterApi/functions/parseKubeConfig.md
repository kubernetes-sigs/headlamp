# Function: parseKubeConfig()

```ts
function parseKubeConfig(clusterReq: ClusterRequest): Promise<any>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:313](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/clusterApi.ts#L313)

parseKubeConfig sends a kubeconfig to the backend to parse and returns
the resulting clusters.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clusterReq` | [`ClusterRequest`](../../clusterRequests/interfaces/ClusterRequest.md) | The cluster request object. |

## Returns

`Promise`\<`any`\>
