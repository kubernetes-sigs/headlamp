# Function: put()

```ts
function put(
   url: string, 
   json: Partial<KubeObjectInterface>, 
   autoLogoutOnAuthError?: boolean, 
requestOptions?: ClusterRequestParams): Promise<any>;
```

Defined in: [lib/k8s/api/v1/clusterRequests.ts:309](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v1/clusterRequests.ts#L309)

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `url` | `string` | `undefined` |
| `json` | `Partial`\<[`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md)\> | `undefined` |
| `autoLogoutOnAuthError` | `boolean` | `true` |
| `requestOptions` | [`ClusterRequestParams`](../interfaces/ClusterRequestParams.md) | `{}` |

## Returns

`Promise`\<`any`\>
