# Function: kubeObjectListQuery()

```ts
function kubeObjectListQuery<K>(
   kubeObjectClass: typeof KubeObject, 
   endpoint: KubeObjectEndpoint, 
   namespace?: string | undefined, 
   cluster: string, 
   queryParams: QueryParameters, 
   refetchInterval?: number): QueryObserverOptions<
  | ListResponse<K>
  | null
| undefined, ApiError>;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:65](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L65)

Query to list Kube objects from a cluster and namespace(optional)

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `kubeObjectClass` | *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) | `undefined` | Class to instantiate the object with |
| `endpoint` | [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md) | `undefined` | API endpoint |
| `namespace` | `string` \| `undefined` | `''` | namespace to list objects from(optional) |
| `cluster` | `string` | `undefined` | cluster name |
| `queryParams` | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) | `undefined` | query parameters |
| `refetchInterval?` | `number` | `undefined` | - |

## Returns

`QueryObserverOptions`\<
  \| [`ListResponse`](../interfaces/ListResponse.md)\<`K`\>
  \| `null`
  \| `undefined`, [`ApiError`](../../ApiError/classes/ApiError.md)\>

query options for getting a single list of kube resources
