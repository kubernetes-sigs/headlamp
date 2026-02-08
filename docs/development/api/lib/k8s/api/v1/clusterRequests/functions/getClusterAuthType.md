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

[src/lib/k8s/api/v1/clusterRequests.ts:75](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L75)
