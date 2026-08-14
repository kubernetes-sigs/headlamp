# Function: testAuth()

```ts
function testAuth(cluster?: string, namespace?: string): Promise<any>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:35](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v1/clusterApi.ts#L35)

Test authentication for the given cluster.
Will throw an error if the user is not authenticated.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `cluster` | `string` | `''` |
| `namespace` | `string` | `'default'` |

## Returns

`Promise`\<`any`\>
