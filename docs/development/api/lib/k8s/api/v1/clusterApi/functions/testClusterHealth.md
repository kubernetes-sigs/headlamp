# Function: testClusterHealth()

```ts
function testClusterHealth(cluster?: string): Promise<any[]>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:125](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/clusterApi.ts#L125)

Checks cluster health
Will throw an error if the cluster is not healthy.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster?` | `string` |

## Returns

`Promise`\<`any`[]\>
