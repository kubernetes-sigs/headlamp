# Function: testClusterHealth()

```ts
function testClusterHealth(cluster?: string): Promise<any[]>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:125](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterApi.ts#L125)

Checks cluster health
Will throw an error if the cluster is not healthy.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster?` | `string` |

## Returns

`Promise`\<`any`[]\>
