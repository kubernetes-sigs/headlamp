# Function: put()

```ts
function put(
   url: string, 
   json: Partial<KubeObjectInterface>, 
   autoLogoutOnAuthError?: boolean, 
requestOptions?: ClusterRequestParams): Promise<any>;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:309](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L309)

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `url` | `string` | `undefined` |
| `json` | `Partial`\<[`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md)\> | `undefined` |
| `autoLogoutOnAuthError` | `boolean` | `true` |
| `requestOptions` | [`ClusterRequestParams`](../interfaces/ClusterRequestParams.md) | `{}` |

## Returns

`Promise`\<`any`\>
