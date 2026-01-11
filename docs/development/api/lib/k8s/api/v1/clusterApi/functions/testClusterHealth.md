# Function: testClusterHealth()

```ts
function testClusterHealth(cluster?: string): Promise<any[]>
```

Checks cluster health
Will throw an error if the cluster is not healthy.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster`? | `string` |

## Returns

`Promise`\<`any`[]\>

## Defined in

[src/lib/k8s/api/v1/clusterApi.ts:48](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterApi.ts#L48)
