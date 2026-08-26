# Function: testClusterHealth()

```ts
function testClusterHealth(cluster?: string): Promise<any[]>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:125](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v1/clusterApi.ts#L125)

Checks cluster health
Will throw an error if the cluster is not healthy.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster?` | `string` |

## Returns

`Promise`\<`any`[]\>
