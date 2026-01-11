# Function: getClusterAuthType()

```ts
function getClusterAuthType(cluster: string): string
```

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | Name of the cluster. |

## Returns

`string`

Auth type of the cluster, or an empty string if the cluster is not found.
It could return 'oidc' or '' for example.

## Defined in

[src/lib/k8s/api/v1/clusterRequests.ts:75](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L75)
