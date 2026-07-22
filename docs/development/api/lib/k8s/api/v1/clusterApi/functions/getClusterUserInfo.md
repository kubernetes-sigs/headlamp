# Function: getClusterUserInfo()

```ts
function getClusterUserInfo(cluster?: string): Promise<ClusterUserInfo>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:67](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterApi.ts#L67)

Get user info for the given cluster using SelfSubjectReview API.
Falls back to returning cluster name if the API is not available.
Returns { username: 'unknown' } if no cluster is resolved.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `cluster` | `string` | `''` | The name of the cluster (optional). |

## Returns

`Promise`\<[`ClusterUserInfo`](../interfaces/ClusterUserInfo.md)\>

Promise resolving to user info
