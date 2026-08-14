# Function: getClusterAuthType()

```ts
function getClusterAuthType(cluster: string): string;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:76](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L76)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | Name of the cluster. |

## Returns

`string`

Auth type of the cluster, or an empty string if the cluster is not found.
It could return 'oidc' or '' for example.
