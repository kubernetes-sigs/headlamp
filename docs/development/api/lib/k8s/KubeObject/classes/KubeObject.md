# Class: KubeObject\<T\>

Defined in: [lib/k8s/KubeObject.ts:52](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L52)

## Extended by

- [`Lease`](../../lease/classes/Lease.md)
- [`LimitRange`](../../limitRange/classes/LimitRange.md)
- [`PodMetrics`](../../PodMetrics/classes/PodMetrics.md)
- [`RuntimeClass`](../../runtime/classes/RuntimeClass.md)
- [`BackendTLSPolicy`](../../backendTLSPolicy/classes/BackendTLSPolicy.md)
- [`BackendTrafficPolicy`](../../backendTrafficPolicy/classes/BackendTrafficPolicy.md)
- [`ClusterRole`](../../clusterRole/classes/ClusterRole.md)
- [`ClusterRoleBinding`](../../clusterRoleBinding/classes/ClusterRoleBinding.md)
- [`ConfigMap`](../../configMap/classes/ConfigMap.md)
- [`ControllerRevision`](../../controllerRevision/classes/ControllerRevision.md)
- [`CustomResourceDefinition`](../../crd/classes/CustomResourceDefinition.md)
- [`CronJob`](../../cronJob/classes/CronJob.md)
- [`DaemonSet`](../../daemonSet/classes/DaemonSet.md)
- [`Deployment`](../../deployment/classes/Deployment.md)
- [`Endpoints`](../../endpoints/classes/Endpoints.md)
- [`EndpointSlice`](../../endpointSlices/classes/EndpointSlice.md)
- [`Event`](../../event/classes/Event.md)
- [`Gateway`](../../gateway/classes/Gateway.md)
- [`GatewayClass`](../../gatewayClass/classes/GatewayClass.md)
- [`GRPCRoute`](../../grpcRoute/classes/GRPCRoute.md)
- [`HPA`](../../hpa/classes/HPA.md)
- [`HTTPRoute`](../../httpRoute/classes/HTTPRoute.md)
- [`Ingress`](../../ingress/classes/Ingress.md)
- [`IngressClass`](../../ingressClass/classes/IngressClass.md)
- [`Job`](../../job/classes/Job.md)
- [`JobSet`](../../jobSet/classes/JobSet.md)
- [`LeaderWorkerSet`](../../leaderWorkerSet/classes/LeaderWorkerSet.md)
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
- [`Secret`](../../secret/classes/Secret.md)
- [`Service`](../../service/classes/Service.md)
- [`ServiceAccount`](../../serviceAccount/classes/ServiceAccount.md)
- [`StatefulSet`](../../statefulSet/classes/StatefulSet.md)
- [`StorageClass`](../../storageClass/classes/StorageClass.md)
- [`ValidatingWebhookConfiguration`](../../validatingWebhookConfiguration/classes/ValidatingWebhookConfiguration.md)
- [`VolumeAttributesClass`](../../volumeAttributesClass/classes/VolumeAttributesClass.md)
- [`VPA`](../../vpa/classes/VPA.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* \| [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../event/interfaces/KubeEvent.md) | `any` |

## Constructors

### Constructor

```ts
new KubeObject<T>(json: T, cluster?: string): KubeObject<T>;
```

Defined in: [lib/k8s/KubeObject.ts:106](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L106)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `json` | `T` |
| `cluster?` | `string` |

#### Returns

`KubeObject`\<`T`\>

## Properties

| Property | Modifier | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="property-_clustername"></a> `_clusterName` | `public` | `string` | `undefined` | - | [lib/k8s/KubeObject.ts:56](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L56) |
| <a id="property-jsondata"></a> `jsonData` | `public` | `T` | `undefined` | - | [lib/k8s/KubeObject.ts:53](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L53) |
| <a id="property-_internalapiendpoint"></a> `_internalApiEndpoint?` | `static` | \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> | `undefined` | - | [lib/k8s/KubeObject.ts:73](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L73) |
| <a id="property-apiname"></a> `apiName` | `readonly` | `string` | `undefined` | Name of the resource, plural, used in API | [lib/k8s/KubeObject.ts:62](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L62) |
| <a id="property-apiversion"></a> `apiVersion` | `readonly` | `string` \| `string`[] | `undefined` | Group and version of the resource formatted as "GROUP/VERSION", e.g. "policy.k8s.io/v1". | [lib/k8s/KubeObject.ts:65](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L65) |
| <a id="property-isnamespaced"></a> `isNamespaced` | `readonly` | `boolean` | `undefined` | Whether the object is namespaced. | [lib/k8s/KubeObject.ts:68](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L68) |
| <a id="property-isscalable"></a> `isScalable` | `readonly` | `boolean` | `undefined` | Whether the object is scalable, and should have a ScaleButton | [lib/k8s/KubeObject.ts:71](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L71) |
| <a id="property-kind"></a> `kind` | `readonly` | `string` | `undefined` | The kind of the object. Corresponding to the resource kind in Kubernetes. | [lib/k8s/KubeObject.ts:59](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L59) |
| <a id="property-readonlyfields"></a> `readOnlyFields` | `static` | `string`[] | `[]` | Readonly field defined as JSONPath paths | [lib/k8s/KubeObject.ts:55](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L55) |

## Accessors

### cluster

#### Get Signature

```ts
get cluster(): string;
```

Defined in: [lib/k8s/KubeObject.ts:111](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L111)

##### Returns

`string`

#### Set Signature

```ts
set cluster(cluster: string): void;
```

Defined in: [lib/k8s/KubeObject.ts:115](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L115)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster` | `string` |

##### Returns

`void`

***

### detailsRoute

#### Get Signature

```ts
get detailsRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:123](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L123)

##### Returns

`string`

***

### isNamespaced

#### Get Signature

```ts
get isNamespaced(): boolean;
```

Defined in: [lib/k8s/KubeObject.ts:232](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L232)

##### Returns

`boolean`

***

### isScalable

#### Get Signature

```ts
get isScalable(): boolean;
```

Defined in: [lib/k8s/KubeObject.ts:236](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L236)

##### Returns

`boolean`

***

### kind

#### Get Signature

```ts
get kind(): any;
```

Defined in: [lib/k8s/KubeObject.ts:186](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L186)

##### Returns

`any`

***

### listRoute

#### Get Signature

```ts
get listRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:178](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L178)

##### Returns

`string`

***

### metadata

#### Get Signature

```ts
get metadata(): KubeMetadata;
```

Defined in: [lib/k8s/KubeObject.ts:228](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L228)

##### Returns

[`KubeMetadata`](../../KubeMetadata/interfaces/KubeMetadata.md)

***

### pluralName

#### Get Signature

```ts
get pluralName(): string;
```

Defined in: [lib/k8s/KubeObject.ts:173](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L173)

##### Returns

`string`

***

### apiEndpoint

#### Get Signature

```ts
get static apiEndpoint(): 
  | ApiClient<KubeObjectInterface>
| ApiWithNamespaceClient<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:75](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L75)

##### Returns

  \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\>
  \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\>

#### Set Signature

```ts
set static apiEndpoint(endpoint: 
  | ApiClient<KubeObjectInterface>
  | ApiWithNamespaceClient<KubeObjectInterface>): void;
```

Defined in: [lib/k8s/KubeObject.ts:102](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L102)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `endpoint` | \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\> |

##### Returns

`void`

***

### apiGroupName

#### Get Signature

```ts
get static apiGroupName(): string | undefined;
```

Defined in: [lib/k8s/KubeObject.ts:139](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L139)

Get name of the API group of this resource
for example will return batch for CronJob

For core group, like Pods, it will return undefined

API group reference https://kubernetes.io/docs/reference/using-api/#api-groups

##### Returns

`string` \| `undefined`

***

### className

#### Get Signature

```ts
get static className(): string;
```

Defined in: [lib/k8s/KubeObject.ts:119](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L119)

##### Returns

`string`

***

### detailsRoute

#### Get Signature

```ts
get static detailsRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:127](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L127)

##### Returns

`string`

***

### listRoute

#### Get Signature

```ts
get static listRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:182](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L182)

##### Returns

`string`

***

### pluralName

#### Get Signature

```ts
get static pluralName(): string;
```

Defined in: [lib/k8s/KubeObject.ts:167](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L167)

##### Returns

`string`

## Methods

### \_class()

```ts
_class(): typeof KubeObject;
```

Defined in: [lib/k8s/KubeObject.ts:498](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L498)

#### Returns

*typeof* `KubeObject`

***

### delete()

```ts
delete(force?: boolean): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:502](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L502)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `force?` | `boolean` |

#### Returns

`Promise`\<`any`\>

***

### getAge()

```ts
getAge(): string;
```

Defined in: [lib/k8s/KubeObject.ts:220](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L220)

#### Returns

`string`

***

### getAuthorization()

```ts
getAuthorization(verb: string, reqResourseAttrs?: AuthRequestResourceAttrs): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:698](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L698)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `verb` | `string` |
| `reqResourseAttrs?` | [`AuthRequestResourceAttrs`](../interfaces/AuthRequestResourceAttrs.md) |

#### Returns

`Promise`\<`any`\>

***

### getCreationTs()

```ts
getCreationTs(): string;
```

Defined in: [lib/k8s/KubeObject.ts:216](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L216)

#### Returns

`string`

***

### getDetailsLink()

```ts
getDetailsLink(): string;
```

Defined in: [lib/k8s/KubeObject.ts:190](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L190)

#### Returns

`string`

***

### getEditableObject()

```ts
getEditableObject(): object;
```

Defined in: [lib/k8s/KubeObject.ts:240](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L240)

#### Returns

`object`

***

### getListLink()

```ts
getListLink(): string;
```

Defined in: [lib/k8s/KubeObject.ts:204](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L204)

#### Returns

`string`

***

### getName()

```ts
getName(): string;
```

Defined in: [lib/k8s/KubeObject.ts:208](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L208)

#### Returns

`string`

***

### getNamespace()

```ts
getNamespace(): string | undefined;
```

Defined in: [lib/k8s/KubeObject.ts:212](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L212)

#### Returns

`string` \| `undefined`

***

### getValue()

```ts
getValue(prop: string): any;
```

Defined in: [lib/k8s/KubeObject.ts:224](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L224)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `prop` | `string` |

#### Returns

`any`

***

### patch()

```ts
patch(body: RecursivePartial<T>): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:606](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L606)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`RecursivePartial`](../../api/v1/factories/type-aliases/RecursivePartial.md)\<`T`\> |

#### Returns

`Promise`\<`any`\>

***

### patchUpdate()

```ts
patchUpdate(original: KubeObjectInterface, modified: KubeObjectInterface): Promise<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:530](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L530)

Updates a resource using JSON Patch (RFC 6902), sending only the diff between
the original and modified objects. This avoids 409 Conflict errors on resources
that are frequently updated by controllers (e.g. HPA).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `original` | [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) |
| `modified` | [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\>

***

### scale()

```ts
scale(numReplicas: number): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:577](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L577)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `numReplicas` | `number` |

#### Returns

`Promise`\<`any`\>

***

### update()

```ts
update(data: KubeObjectInterface): Promise<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:521](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L521)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\>

***

### apiGet()

```ts
static apiGet<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onGet: (...args: any) => void, 
   name: string, 
   namespace?: string, 
   onError?: (err: ApiError | null, cluster?: string) => void, 
   opts?: object): (...args: any[]) => Promise;
```

Defined in: [lib/k8s/KubeObject.ts:455](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L455)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* `KubeObject`\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* `KubeObject` |
| `onGet` | (...`args`: `any`) => `void` |
| `name` | `string` |
| `namespace?` | `string` |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`, `cluster?`: `string`) => `void` |
| `opts?` | \{ `cluster?`: `string`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `opts.cluster?` | `string` |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

(...`args`: `any`[]) => `Promise`

***

### apiList()

```ts
static apiList<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onList: (arg: K[]) => void, 
   onError?: (err: ApiError, cluster?: string) => void, 
opts?: ApiListSingleNamespaceOptions): () => Promise<CancelFunction>;
```

Defined in: [lib/k8s/KubeObject.ts:270](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L270)

Builds a list request for this object's API endpoint.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* `KubeObject`\<`any`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* `KubeObject` | - |
| `onList` | (`arg`: `K`[]) => `void` | Callback function to be called when the list is retrieved. |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster?`: `string`) => `void` | Callback function to be called when an error occurs. |
| `opts?` | [`ApiListSingleNamespaceOptions`](../interfaces/ApiListSingleNamespaceOptions.md) | Options to be passed to the API endpoint. |

#### Returns

A parameterless function that starts the list request and resolves
         to a [CancelFunction](../../api/v1/factories/type-aliases/CancelFunction.md) for stopping it.

() => `Promise`\<[`CancelFunction`](../../api/v1/factories/type-aliases/CancelFunction.md)\>

***

### create()

```ts
static create<Args, T>(this: (...args: Args) => T, ...item: Args): T;
```

Defined in: [lib/k8s/KubeObject.ts:448](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L448)

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `any`[] |
| `T` *extends* `KubeObject`\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `Args`) => `T` |
| ...`item` | `Args` |

#### Returns

`T`

***

### fetchAuthorization()

```ts
static fetchAuthorization(reqResourseAttrs?: AuthRequestResourceAttrs, cluster?: string): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:623](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L623)

Performs a request to check if the user has the given permission.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `reqResourseAttrs?` | [`AuthRequestResourceAttrs`](../interfaces/AuthRequestResourceAttrs.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`any`\>

The result of the access request.

***

### getAuthorization()

```ts
static getAuthorization(
   verb: string, 
   reqResourseAttrs?: AuthRequestResourceAttrs, 
cluster?: string): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:651](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L651)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `verb` | `string` |
| `reqResourseAttrs?` | [`AuthRequestResourceAttrs`](../interfaces/AuthRequestResourceAttrs.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`any`\>

***

### getBaseObject()

```ts
static getBaseObject(): Omit<KubeObjectInterface, "metadata"> & object;
```

Defined in: [lib/k8s/KubeObject.ts:742](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L742)

#### Returns

`Omit`\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md), `"metadata"`\> & `object`

***

### getErrorMessage()

```ts
static getErrorMessage(err: ApiError | null): "Error" | "Error: Not found" | "Error: No permissions" | null;
```

Defined in: [lib/k8s/KubeObject.ts:727](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L727)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null` |

#### Returns

`"Error"` \| `"Error: Not found"` \| `"Error: No permissions"` \| `null`

***

### isClassOf()

```ts
static isClassOf<K>(this: K, maybeInstance: KubeObject): maybeInstance is InstanceType<K>;
```

Defined in: [lib/k8s/KubeObject.ts:158](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L158)

Type guard to check if a KubeObject instance belongs to this class.
Compares API group name and kind to determine if the instance matches.
This works even if class definitions are duplicated and should be used
instead of `instanceof`.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* *typeof* `KubeObject` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | `K` | - |
| `maybeInstance` | `KubeObject` | The KubeObject instance to check. |

#### Returns

`maybeInstance is InstanceType<K>`

True if the instance is of this class type, with narrowed type.

***

### put()

```ts
static put(data: KubeObjectInterface): Promise<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:573](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L573)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../interfaces/KubeObjectInterface.md)\>

***

### useApiGet()

```ts
static useApiGet<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onGet: (item: K | null) => any, 
   name: string, 
   namespace?: string, 
   onError?: (err: ApiError | null, cluster?: string) => void, 
   opts?: object): void;
```

Defined in: [lib/k8s/KubeObject.ts:480](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L480)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* `KubeObject`\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* `KubeObject` |
| `onGet` | (`item`: `K` \| `null`) => `any` |
| `name` | `string` |
| `namespace?` | `string` |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`, `cluster?`: `string`) => `void` |
| `opts?` | \{ `cluster?`: `string`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `opts.cluster?` | `string` |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

`void`

***

### useApiList()

```ts
static useApiList<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onList: (...arg: any[]) => any, 
   onError?: (err: ApiError, cluster?: string) => void, 
   opts?: ApiListOptions): void;
```

Defined in: [lib/k8s/KubeObject.ts:305](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L305)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* `KubeObject`\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* `KubeObject` |
| `onList` | (...`arg`: `any`[]) => `any` |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster?`: `string`) => `void` |
| `opts?` | [`ApiListOptions`](../interfaces/ApiListOptions.md) |

#### Returns

`void`

***

### useGet()

```ts
static useGet<K>(
   this: (...args: any) => K, 
   name: string, 
   namespace?: string, 
opts?: object): [K | null, ApiError | null] & QueryResponse<K, ApiError>;
```

Defined in: [lib/k8s/KubeObject.ts:429](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L429)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* `KubeObject`\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` |
| `name` | `string` |
| `namespace?` | `string` |
| `opts?` | \{ `cluster?`: `string`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `opts.cluster?` | `string` |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

\[`K` \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryResponse`](../../api/v2/hooks/interfaces/QueryResponse.md)\<`K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>

***

### useList()

```ts
static useList<K>(this: (...args: any) => K & typeof KubeObject, __namedParameters?: object & QueryParameters): [K[] | null, ApiError | null] & QueryListResponse<(
  | ListResponse<K>
  | null
| undefined)[], K, ApiError>;
```

Defined in: [lib/k8s/KubeObject.ts:376](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L376)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* `KubeObject`\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* `KubeObject` |
| `__namedParameters` | `object` & [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

\[`K`[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<(
  \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\>
  \| `null`
  \| `undefined`)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>
