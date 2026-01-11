# Function: testAuth()

```ts
function testAuth(cluster: string, namespace: string): Promise<any>
```

Test authentication for the given cluster.
Will throw an error if the user is not authenticated.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `cluster` | `string` | `''` |
| `namespace` | `string` | `'default'` |

## Returns

`Promise`\<`any`\>

## Defined in

[src/lib/k8s/api/v1/clusterApi.ts:34](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/clusterApi.ts#L34)
