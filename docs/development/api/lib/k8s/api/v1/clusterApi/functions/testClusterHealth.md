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

[src/lib/k8s/api/v1/clusterApi.ts:48](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v1/clusterApi.ts#L48)
