# Function: testClusterHealth()

```ts
function testClusterHealth(cluster?: string): Promise<any[]>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:125](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/clusterApi.ts#L125)

Checks cluster health
Will throw an error if the cluster is not healthy.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster?` | `string` |

## Returns

`Promise`\<`any`[]\>
