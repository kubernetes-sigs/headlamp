# Function: getClusterAuthType()

```ts
function getClusterAuthType(cluster: string): string;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:76](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L76)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | Name of the cluster. |

## Returns

`string`

Auth type of the cluster, or an empty string if the cluster is not found.
It could return 'oidc' or '' for example.
