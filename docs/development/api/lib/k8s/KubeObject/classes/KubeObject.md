# Class: KubeObject\<T\>

## Extended by

- [`PodMetrics`](../../PodMetrics/classes/PodMetrics.md)
- [`BackendTLSPolicy`](../../backendTLSPolicy/classes/BackendTLSPolicy.md)
- [`BackendTrafficPolicy`](../../backendTrafficPolicy/classes/BackendTrafficPolicy.md)
- [`ClusterRole`](../../clusterRole/classes/ClusterRole.md)
- [`ClusterRoleBinding`](../../clusterRoleBinding/classes/ClusterRoleBinding.md)
- [`ConfigMap`](../../configMap/classes/ConfigMap.md)
- [`CustomResourceDefinition`](../../crd/classes/CustomResourceDefinition.md)
- [`CronJob`](../../cronJob/classes/CronJob.md)
- [`DaemonSet`](../../daemonSet/classes/DaemonSet.md)
- [`Deployment`](../../deployment/classes/Deployment.md)
- [`EndpointSlice`](../../endpointSlices/classes/EndpointSlice.md)
- [`Endpoints`](../../endpoints/classes/Endpoints.md)
- [`Event`](../../event/classes/Event.md)
- [`Gateway`](../../gateway/classes/Gateway.md)
- [`GatewayClass`](../../gatewayClass/classes/GatewayClass.md)
- [`GRPCRoute`](../../grpcRoute/classes/GRPCRoute.md)
- [`HPA`](../../hpa/classes/HPA.md)
- [`HTTPRoute`](../../httpRoute/classes/HTTPRoute.md)
- [`Ingress`](../../ingress/classes/Ingress.md)
- [`IngressClass`](../../ingressClass/classes/IngressClass.md)
- [`Job`](../../job/classes/Job.md)
- [`Lease`](../../lease/classes/Lease.md)
- [`LimitRange`](../../limitRange/classes/LimitRange.md)
- [`MutatingWebhookConfiguration`](../../mutatingWebhookConfiguration/classes/MutatingWebhookConfiguration.md)
- [`Namespace`](../../namespace/classes/Namespace.md)
- [`NetworkPolicy`](../../networkpolicy/classes/NetworkPolicy.md)
- [`Node`](../../node/classes/Node.md)
- [`PersistentVolume`](../../persistentVolume/classes/PersistentVolume.md)
- [`PersistentVolumeClaim`](../../persistentVolumeClaim/classes/PersistentVolumeClaim.md)
- [`Pod`](../../pod/classes/Pod.md)
- [`PDB`](../../podDisruptionBudget/classes/PDB.md)
- [`PriorityClass`](../../priorityClass/classes/PriorityClass.md)
- [`ReferenceGrant`](../../referenceGrant/classes/ReferenceGrant.md)
- [`ReplicaSet`](../../replicaSet/classes/ReplicaSet.md)
- [`ResourceQuota`](../../resourceQuota/classes/ResourceQuota.md)
- [`Role`](../../role/classes/Role.md)
- [`RoleBinding`](../../roleBinding/classes/RoleBinding.md)
- [`RuntimeClass`](../../runtime/classes/RuntimeClass.md)
- [`Secret`](../../secret/classes/Secret.md)
- [`Service`](../../service/classes/Service.md)
- [`ServiceAccount`](../../serviceAccount/classes/ServiceAccount.md)
- [`StatefulSet`](../../statefulSet/classes/StatefulSet.md)
- [`StorageClass`](../../storageClass/classes/StorageClass.md)
- [`ValidatingWebhookConfiguration`](../../validatingWebhookConfiguration/classes/ValidatingWebhookConfiguration.md)
- [`VPA`](../../vpa/classes/VPA.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../event/interfaces/KubeEvent.md) | `any` |

## Constructors

### new KubeObject()

```ts
new KubeObject<T>(json: T, cluster?: string): KubeObject<T>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `json` | `T` |
| `cluster`? | `string` |

#### Returns

[`KubeObject`](KubeObject.md)\<`T`\>

#### Defined in

[src/lib/k8s/KubeObject.ts:100](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L100)

## Properties

| Property | Modifier | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ |
| `_clusterName` | `public` | `string` | `undefined` | - | [src/lib/k8s/KubeObject.ts:50](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L50) |
| `jsonData` | `public` | `T` | `undefined` | - | [src/lib/k8s/KubeObject.ts:47](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L47) |
| `_internalApiEndpoint?` | `static` | [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> | `undefined` | - | [src/lib/k8s/KubeObject.ts:67](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L67) |
| `apiName` | `readonly` | `string` | `undefined` | Name of the resource, plural, used in API | [src/lib/k8s/KubeObject.ts:56](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L56) |
| `apiVersion` | `readonly` | `string` \| `string`[] | `undefined` | Group and version of the resource formatted as "GROUP/VERSION", e.g. "policy.k8s.io/v1". | [src/lib/k8s/KubeObject.ts:59](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L59) |
| `isNamespaced` | `readonly` | `boolean` | `undefined` | Whether the object is namespaced. | [src/lib/k8s/KubeObject.ts:62](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L62) |
| `isScalable` | `readonly` | `boolean` | `undefined` | Whether the object is scalable, and should have a ScaleButton | [src/lib/k8s/KubeObject.ts:65](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L65) |
| `kind` | `readonly` | `string` | `undefined` | The kind of the object. Corresponding to the resource kind in Kubernetes. | [src/lib/k8s/KubeObject.ts:53](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L53) |
| `readOnlyFields` | `static` | `string`[] | `[]` | Readonly field defined as JSONPath paths | [src/lib/k8s/KubeObject.ts:49](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L49) |

## Accessors

### cluster

```ts
get cluster(): string
```

```ts
set cluster(cluster: string): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster` | `string` |

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:105](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L105)

***

### detailsRoute

```ts
get detailsRoute(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:117](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L117)

***

### isNamespaced

```ts
get isNamespaced(): boolean
```

#### Returns

`boolean`

#### Defined in

[src/lib/k8s/KubeObject.ts:225](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L225)

***

### isScalable

```ts
get isScalable(): boolean
```

#### Returns

`boolean`

#### Defined in

[src/lib/k8s/KubeObject.ts:229](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L229)

***

### kind

```ts
get kind(): any
```

#### Returns

`any`

#### Defined in

[src/lib/k8s/KubeObject.ts:179](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L179)

***

### listRoute

```ts
get listRoute(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:171](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L171)

***

### metadata

```ts
get metadata(): KubeMetadata
```

#### Returns

[`KubeMetadata`](../../KubeMetadata/interfaces/KubeMetadata.md)

#### Defined in

[src/lib/k8s/KubeObject.ts:221](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L221)

***

### pluralName

```ts
get pluralName(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:166](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L166)

***

### apiEndpoint

```ts
get static apiEndpoint(): ApiClient<KubeObjectInterface> | ApiWithNamespaceClient<KubeObjectInterface>
```

```ts
set static apiEndpoint(endpoint: ApiClient<KubeObjectInterface> | ApiWithNamespaceClient<KubeObjectInterface>): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `endpoint` | [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> |

#### Returns

[`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\>

#### Defined in

[src/lib/k8s/KubeObject.ts:69](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L69)

***

### apiGroupName

```ts
get static apiGroupName(): undefined | string
```

Get name of the API group of this resource
for example will return batch for CronJob

For core group, like Pods, it will return undefined

API group reference https://kubernetes.io/docs/reference/using-api/#api-groups

#### Returns

`undefined` \| `string`

#### Defined in

[src/lib/k8s/KubeObject.ts:133](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L133)

***

### className

```ts
get static className(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:113](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L113)

***

### detailsRoute

```ts
get static detailsRoute(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:121](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L121)

***

### listRoute

```ts
get static listRoute(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:175](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L175)

***

### pluralName

```ts
get static pluralName(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:160](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L160)

## Methods

### \_class()

```ts
_class(): typeof KubeObject
```

#### Returns

*typeof* [`KubeObject`](KubeObject.md)

#### Defined in

[src/lib/k8s/KubeObject.ts:481](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L481)

***

### delete()

```ts
delete(force?: boolean): Promise<any>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `force`? | `boolean` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/KubeObject.ts:485](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L485)

***

### getAge()

```ts
getAge(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:213](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L213)

***

### getAuthorization()

```ts
getAuthorization(verb: string, reqResourseAttrs?: AuthRequestResourceAttrs): Promise<any>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `verb` | `string` |
| `reqResourseAttrs`? | [`AuthRequestResourceAttrs`](../interfaces/AuthRequestResourceAttrs.md) |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/KubeObject.ts:631](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L631)

***

### getCreationTs()

```ts
getCreationTs(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:209](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L209)

***

### getDetailsLink()

```ts
getDetailsLink(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:183](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L183)

***

### getEditableObject()

```ts
getEditableObject(): object
```

#### Returns

`object`

#### Defined in

[src/lib/k8s/KubeObject.ts:233](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L233)

***

### getListLink()

```ts
getListLink(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:197](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L197)

***

### getName()

```ts
getName(): string
```

#### Returns

`string`

#### Defined in

[src/lib/k8s/KubeObject.ts:201](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L201)

***

### getNamespace()

```ts
getNamespace(): undefined | string
```

#### Returns

`undefined` \| `string`

#### Defined in

[src/lib/k8s/KubeObject.ts:205](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L205)

***

### getValue()

```ts
getValue(prop: string): any
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `prop` | `string` |

#### Returns

`any`

#### Defined in

[src/lib/k8s/KubeObject.ts:217](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L217)

***

### patch()

```ts
patch(body: RecursivePartial<T>): Promise<any>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`RecursivePartial`](../../api/v1/factories/type-aliases/RecursivePartial.md)\<`T`\> |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/KubeObject.ts:539](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L539)

***

### scale()

```ts
scale(numReplicas: number): Promise<any>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `numReplicas` | `number` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/KubeObject.ts:510](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L510)

***

### update()

```ts
update(data: KubeObjectInterface): Promise<KubeObjectInterface>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\>

#### Defined in

[src/lib/k8s/KubeObject.ts:502](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L502)

***

### apiGet()

```ts
static apiGet<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onGet: (...args: any) => void, 
   name: string, 
   namespace?: string, 
   onError?: (err: null | ApiError, cluster?: string) => void, 
opts?: object): (...args: any[]) => Promise<CancelFunction>
```

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](KubeObject.md) |
| `onGet` | (...`args`: `any`) => `void` |
| `name` | `string` |
| `namespace`? | `string` |
| `onError`? | (`err`: `null` \| [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster`?: `string`) => `void` |
| `opts`? | `object` |
| `opts.cluster`? | `string` |
| `opts.queryParams`? | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

`Function`

##### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `any`[] |

##### Returns

`Promise`\<[`CancelFunction`](../../api/v1/factories/type-aliases/CancelFunction.md)\>

#### Defined in

[src/lib/k8s/KubeObject.ts:439](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L439)

***

### apiList()

```ts
static apiList<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onList: (arg: K[]) => void, 
   onError?: (err: ApiError, cluster?: string) => void, 
opts?: ApiListSingleNamespaceOptions): (...args: any[]) => Promise<CancelFunction>
```

Returns the API endpoint for this object.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](KubeObject.md) | - |
| `onList` | (`arg`: `K`[]) => `void` | Callback function to be called when the list is retrieved. |
| `onError`? | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster`?: `string`) => `void` | Callback function to be called when an error occurs. |
| `opts`? | [`ApiListSingleNamespaceOptions`](../interfaces/ApiListSingleNamespaceOptions.md) | Options to be passed to the API endpoint. |

#### Returns

`Function`

The API endpoint for this object.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `any`[] |

##### Returns

`Promise`\<[`CancelFunction`](../../api/v1/factories/type-aliases/CancelFunction.md)\>

#### Defined in

[src/lib/k8s/KubeObject.ts:263](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L263)

***

### create()

```ts
static create<Args, T>(this: (...args: Args) => T, ...item: Args): T
```

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `any`[] |
| `T` *extends* [`KubeObject`](KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `Args`) => `T` |
| ...`item` | `Args` |

#### Returns

`T`

#### Defined in

[src/lib/k8s/KubeObject.ts:432](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L432)

***

### fetchAuthorization()

```ts
static fetchAuthorization(reqResourseAttrs?: AuthRequestResourceAttrs, cluster?: string): Promise<any>
```

Performs a request to check if the user has the given permission.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `reqResourseAttrs`? | [`AuthRequestResourceAttrs`](../interfaces/AuthRequestResourceAttrs.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`any`\>

The result of the access request.

#### Defined in

[src/lib/k8s/KubeObject.ts:556](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L556)

***

### getAuthorization()

```ts
static getAuthorization(
   verb: string, 
   reqResourseAttrs?: AuthRequestResourceAttrs, 
cluster?: string): Promise<any>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `verb` | `string` |
| `reqResourseAttrs`? | [`AuthRequestResourceAttrs`](../interfaces/AuthRequestResourceAttrs.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/KubeObject.ts:584](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L584)

***

### getBaseObject()

```ts
static getBaseObject(): Omit<KubeObjectInterface, "metadata"> & object
```

#### Returns

`Omit`\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md), `"metadata"`\> & `object`

#### Defined in

[src/lib/k8s/KubeObject.ts:675](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L675)

***

### getErrorMessage()

```ts
static getErrorMessage(err: null | ApiError): null | "Error: Not found" | "Error: No permissions" | "Error"
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `null` \| [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) |

#### Returns

`null` \| `"Error: Not found"` \| `"Error: No permissions"` \| `"Error"`

#### Defined in

[src/lib/k8s/KubeObject.ts:660](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L660)

***

### isClassOf()

```ts
static isClassOf<K>(this: K, maybeInstance: KubeObject<any>): maybeInstance is InstanceType<K>
```

Type guard to check if a KubeObject instance belongs to this class.
Compares API group name and kind to determine if the instance matches.
This works even if class definitions are duplicated and should be used
instead of `instanceof`.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* *typeof* [`KubeObject`](KubeObject.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | `K` | - |
| `maybeInstance` | [`KubeObject`](KubeObject.md)\<`any`\> | The KubeObject instance to check. |

#### Returns

`maybeInstance is InstanceType<K>`

True if the instance is of this class type, with narrowed type.

#### Defined in

[src/lib/k8s/KubeObject.ts:151](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L151)

***

### put()

```ts
static put(data: KubeObjectInterface): Promise<KubeObjectInterface>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\>

#### Defined in

[src/lib/k8s/KubeObject.ts:506](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L506)

***

### useApiGet()

```ts
static useApiGet<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onGet: (item: null | K) => any, 
   name: string, 
   namespace?: string, 
   onError?: (err: null | ApiError, cluster?: string) => void, 
   opts?: object): void
```

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](KubeObject.md) |
| `onGet` | (`item`: `null` \| `K`) => `any` |
| `name` | `string` |
| `namespace`? | `string` |
| `onError`? | (`err`: `null` \| [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster`?: `string`) => `void` |
| `opts`? | `object` |
| `opts.cluster`? | `string` |
| `opts.queryParams`? | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

`void`

#### Defined in

[src/lib/k8s/KubeObject.ts:464](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L464)

***

### useApiList()

```ts
static useApiList<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onList: (...arg: any[]) => any, 
   onError?: (err: ApiError, cluster?: string) => void, 
   opts?: ApiListOptions): void
```

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](KubeObject.md) |
| `onList` | (...`arg`: `any`[]) => `any` |
| `onError`? | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster`?: `string`) => `void` |
| `opts`? | [`ApiListOptions`](../interfaces/ApiListOptions.md) |

#### Returns

`void`

#### Defined in

[src/lib/k8s/KubeObject.ts:296](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L296)

***

### useGet()

```ts
static useGet<K>(
   this: (...args: any) => K, 
   name: string, 
   namespace?: string, 
opts?: object): [null | K, null | ApiError] & QueryResponse<K, ApiError>
```

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` |
| `name` | `string` |
| `namespace`? | `string` |
| `opts`? | `object` |
| `opts.cluster`? | `string` |
| `opts.queryParams`? | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

[`null` \| `K`, `null` \| [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)] & [`QueryResponse`](../../api/v2/hooks/interfaces/QueryResponse.md)\<`K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>

#### Defined in

[src/lib/k8s/KubeObject.ts:414](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L414)

***

### useList()

```ts
static useList<K>(this: (...args: any) => K & typeof KubeObject, __namedParameters: object & QueryParameters): [null | K[], null | ApiError] & QueryListResponse<(undefined | null | ListResponse<K>)[], K, ApiError>
```

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](KubeObject.md) |
| `__namedParameters` | `object` & [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

[`null` \| `K`[], `null` \| [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<(`undefined` \| `null` \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\>)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>

#### Defined in

[src/lib/k8s/KubeObject.ts:365](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L365)
