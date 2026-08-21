# Function: testAuth()

```ts
function testAuth(cluster?: string, namespace?: string): Promise<any>;
```

Defined in: [lib/k8s/api/v1/clusterApi.ts:35](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/clusterApi.ts#L35)

Test authentication for the given cluster.
Will throw an error if the user is not authenticated.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `cluster` | `string` | `''` |
| `namespace` | `string` | `'default'` |

## Returns

`Promise`\<`any`\>
