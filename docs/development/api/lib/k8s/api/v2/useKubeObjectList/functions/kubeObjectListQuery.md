# Function: kubeObjectListQuery()

```ts
function kubeObjectListQuery<K>(
   kubeObjectClass: typeof KubeObject, 
   endpoint: KubeObjectEndpoint, 
   namespace: undefined | string, 
   cluster: string, 
   queryParams: QueryParameters, 
refetchInterval?: number): QueryObserverOptions<ListResponse<K> | undefined | null, ApiError>
```

Query to list Kube objects from a cluster and namespace(optional)

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md)\<`any`\> |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `kubeObjectClass` | *typeof* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) | Class to instantiate the object with |
| `endpoint` | [`KubeObjectEndpoint`](../../KubeObjectEndpoint/interfaces/KubeObjectEndpoint.md) | API endpoint |
| `namespace` | `undefined` \| `string` | namespace to list objects from(optional) |
| `cluster` | `string` | cluster name |
| `queryParams` | [`QueryParameters`](../../../v1/queryParameters/interfaces/QueryParameters.md) | query parameters |
| `refetchInterval`? | `number` | - |

## Returns

`QueryObserverOptions`\<[`ListResponse`](../interfaces/ListResponse.md)\<`K`\> \| `undefined` \| `null`, [`ApiError`](../../ApiError/classes/ApiError.md)\>

query options for getting a single list of kube resources

## Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:64](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L64)
