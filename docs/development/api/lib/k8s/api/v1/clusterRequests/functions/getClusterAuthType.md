# Function: getClusterAuthType()

```ts
function getClusterAuthType(cluster: string): string;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:76](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L76)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cluster` | `string` | Name of the cluster. |

## Returns

`string`

Auth type of the cluster, or an empty string if the cluster is not found.
It could return 'oidc' or '' for example.
