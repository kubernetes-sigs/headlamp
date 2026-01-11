# Class: ReplicaSet

## Extends

- [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<[`KubeReplicaSet`](../interfaces/KubeReplicaSet.md)\>

## Constructors

### new ReplicaSet()

```ts
new ReplicaSet(json: KubeReplicaSet, cluster?: string): ReplicaSet
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `json` | [`KubeReplicaSet`](../interfaces/KubeReplicaSet.md) |
| `cluster`? | `string` |

#### Returns

[`ReplicaSet`](ReplicaSet.md)

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`constructor`](../../KubeObject/classes/KubeObject.md#constructors)

#### Defined in

[src/lib/k8s/KubeObject.ts:100](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L100)

## Properties

| Property | Modifier | Type | Default value | Description | Overrides | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| `_clusterName` | `public` | `string` | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`_clusterName` | [src/lib/k8s/KubeObject.ts:50](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L50) |
| `jsonData` | `public` | [`KubeReplicaSet`](../interfaces/KubeReplicaSet.md) | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`jsonData` | [src/lib/k8s/KubeObject.ts:47](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L47) |
| `_internalApiEndpoint?` | `static` | [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`_internalApiEndpoint` | [src/lib/k8s/KubeObject.ts:67](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L67) |
| `apiName` | `static` | `string` | `'replicasets'` | Name of the resource, plural, used in API | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`apiName` | - | [src/lib/k8s/replicaSet.ts:46](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L46) |
| `apiVersion` | `static` | `string` | `'apps/v1'` | Group and version of the resource formatted as "GROUP/VERSION", e.g. "policy.k8s.io/v1". | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`apiVersion` | - | [src/lib/k8s/replicaSet.ts:47](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L47) |
| `isNamespaced` | `static` | `boolean` | `true` | Whether the object is namespaced. | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`isNamespaced` | - | [src/lib/k8s/replicaSet.ts:48](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L48) |
| `isScalable` | `static` | `boolean` | `true` | Whether the object is scalable, and should have a ScaleButton | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`isScalable` | - | [src/lib/k8s/replicaSet.ts:49](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L49) |
| `kind` | `static` | `string` | `'ReplicaSet'` | The kind of the object. Corresponding to the resource kind in Kubernetes. | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`kind` | - | [src/lib/k8s/replicaSet.ts:45](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L45) |
| `readOnlyFields` | `static` | `string`[] | `[]` | Readonly field defined as JSONPath paths | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).`readOnlyFields` | [src/lib/k8s/KubeObject.ts:49](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L49) |

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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`cluster`](../../KubeObject/classes/KubeObject.md#cluster)

#### Defined in

[src/lib/k8s/KubeObject.ts:105](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L105)

***

### detailsRoute

```ts
get detailsRoute(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`detailsRoute`](../../KubeObject/classes/KubeObject.md#detailsroute)

#### Defined in

[src/lib/k8s/KubeObject.ts:117](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L117)

***

### isNamespaced

```ts
get isNamespaced(): boolean
```

#### Returns

`boolean`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isNamespaced`](../../KubeObject/classes/KubeObject.md#isnamespaced)

#### Defined in

[src/lib/k8s/KubeObject.ts:225](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L225)

***

### isScalable

```ts
get isScalable(): boolean
```

#### Returns

`boolean`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isScalable`](../../KubeObject/classes/KubeObject.md#isscalable)

#### Defined in

[src/lib/k8s/KubeObject.ts:229](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L229)

***

### kind

```ts
get kind(): any
```

#### Returns

`any`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`kind`](../../KubeObject/classes/KubeObject.md#kind)

#### Defined in

[src/lib/k8s/KubeObject.ts:179](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L179)

***

### listRoute

```ts
get listRoute(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`listRoute`](../../KubeObject/classes/KubeObject.md#listroute)

#### Defined in

[src/lib/k8s/KubeObject.ts:171](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L171)

***

### metadata

```ts
get metadata(): KubeMetadata
```

#### Returns

[`KubeMetadata`](../../KubeMetadata/interfaces/KubeMetadata.md)

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`metadata`](../../KubeObject/classes/KubeObject.md#metadata)

#### Defined in

[src/lib/k8s/KubeObject.ts:221](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L221)

***

### pluralName

```ts
get pluralName(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`pluralName`](../../KubeObject/classes/KubeObject.md#pluralname)

#### Defined in

[src/lib/k8s/KubeObject.ts:166](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L166)

***

### spec

```ts
get spec(): object
```

#### Returns

`object`

##### minReadySeconds

```ts
minReadySeconds: number;
```

##### replicas

```ts
replicas: number;
```

##### selector

```ts
selector: LabelSelector;
```

##### template

```ts
template: object;
```

##### template.metadata?

```ts
optional metadata: KubeMetadata;
```

##### template.spec

```ts
spec: KubePodSpec;
```

#### Defined in

[src/lib/k8s/replicaSet.ts:51](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L51)

***

### status

```ts
get status(): object
```

#### Returns

`object`

##### availableReplicas

```ts
availableReplicas: number;
```

##### conditions

```ts
conditions: Omit<KubeCondition, "lastProbeTime" | "lastUpdateTime">[];
```

##### fullyLabeledReplicas

```ts
fullyLabeledReplicas: number;
```

##### observedGeneration

```ts
observedGeneration: number;
```

##### readyReplicas

```ts
readyReplicas: number;
```

##### replicas

```ts
replicas: number;
```

#### Defined in

[src/lib/k8s/replicaSet.ts:55](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L55)

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
| `endpoint` | [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> |

#### Returns

[`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiEndpoint`](../../KubeObject/classes/KubeObject.md#apiendpoint)

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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiGroupName`](../../KubeObject/classes/KubeObject.md#apigroupname)

#### Defined in

[src/lib/k8s/KubeObject.ts:133](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L133)

***

### className

```ts
get static className(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`className`](../../KubeObject/classes/KubeObject.md#classname)

#### Defined in

[src/lib/k8s/KubeObject.ts:113](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L113)

***

### detailsRoute

```ts
get static detailsRoute(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`detailsRoute`](../../KubeObject/classes/KubeObject.md#detailsroute-1)

#### Defined in

[src/lib/k8s/KubeObject.ts:121](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L121)

***

### listRoute

```ts
get static listRoute(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`listRoute`](../../KubeObject/classes/KubeObject.md#listroute-1)

#### Defined in

[src/lib/k8s/KubeObject.ts:175](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L175)

***

### pluralName

```ts
get static pluralName(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`pluralName`](../../KubeObject/classes/KubeObject.md#pluralname-1)

#### Defined in

[src/lib/k8s/KubeObject.ts:160](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L160)

## Methods

### \_class()

```ts
_class(): typeof KubeObject
```

#### Returns

*typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md)

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_class`](../../KubeObject/classes/KubeObject.md#_class)

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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`delete`](../../KubeObject/classes/KubeObject.md#delete)

#### Defined in

[src/lib/k8s/KubeObject.ts:485](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L485)

***

### getAge()

```ts
getAge(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getAge`](../../KubeObject/classes/KubeObject.md#getage)

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
| `reqResourseAttrs`? | [`AuthRequestResourceAttrs`](../../KubeObject/interfaces/AuthRequestResourceAttrs.md) |

#### Returns

`Promise`\<`any`\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getAuthorization`](../../KubeObject/classes/KubeObject.md#getauthorization)

#### Defined in

[src/lib/k8s/KubeObject.ts:631](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L631)

***

### getContainers()

```ts
getContainers(): KubeContainer[]
```

#### Returns

[`KubeContainer`](../../cluster/interfaces/KubeContainer.md)[]

#### Defined in

[src/lib/k8s/replicaSet.ts:87](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L87)

***

### getCreationTs()

```ts
getCreationTs(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getCreationTs`](../../KubeObject/classes/KubeObject.md#getcreationts)

#### Defined in

[src/lib/k8s/KubeObject.ts:209](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L209)

***

### getDetailsLink()

```ts
getDetailsLink(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getDetailsLink`](../../KubeObject/classes/KubeObject.md#getdetailslink)

#### Defined in

[src/lib/k8s/KubeObject.ts:183](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L183)

***

### getEditableObject()

```ts
getEditableObject(): object
```

#### Returns

`object`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getEditableObject`](../../KubeObject/classes/KubeObject.md#geteditableobject)

#### Defined in

[src/lib/k8s/KubeObject.ts:233](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L233)

***

### getListLink()

```ts
getListLink(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getListLink`](../../KubeObject/classes/KubeObject.md#getlistlink)

#### Defined in

[src/lib/k8s/KubeObject.ts:197](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L197)

***

### getMatchLabelsList()

```ts
getMatchLabelsList(): string[]
```

#### Returns

`string`[]

#### Defined in

[src/lib/k8s/replicaSet.ts:91](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L91)

***

### getName()

```ts
getName(): string
```

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getName`](../../KubeObject/classes/KubeObject.md#getname)

#### Defined in

[src/lib/k8s/KubeObject.ts:201](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L201)

***

### getNamespace()

```ts
getNamespace(): undefined | string
```

#### Returns

`undefined` \| `string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getNamespace`](../../KubeObject/classes/KubeObject.md#getnamespace)

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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getValue`](../../KubeObject/classes/KubeObject.md#getvalue)

#### Defined in

[src/lib/k8s/KubeObject.ts:217](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L217)

***

### patch()

```ts
patch(body: RecursivePartial<KubeReplicaSet>): Promise<any>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`RecursivePartial`](../../api/v1/factories/type-aliases/RecursivePartial.md)\<[`KubeReplicaSet`](../interfaces/KubeReplicaSet.md)\> |

#### Returns

`Promise`\<`any`\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`patch`](../../KubeObject/classes/KubeObject.md#patch)

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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`scale`](../../KubeObject/classes/KubeObject.md#scale)

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
| `data` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`update`](../../KubeObject/classes/KubeObject.md#update)

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
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |
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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiGet`](../../KubeObject/classes/KubeObject.md#apiget)

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
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) | - |
| `onList` | (`arg`: `K`[]) => `void` | Callback function to be called when the list is retrieved. |
| `onError`? | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster`?: `string`) => `void` | Callback function to be called when an error occurs. |
| `opts`? | [`ApiListSingleNamespaceOptions`](../../KubeObject/interfaces/ApiListSingleNamespaceOptions.md) | Options to be passed to the API endpoint. |

#### Returns

`Function`

The API endpoint for this object.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `any`[] |

##### Returns

`Promise`\<[`CancelFunction`](../../api/v1/factories/type-aliases/CancelFunction.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiList`](../../KubeObject/classes/KubeObject.md#apilist)

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
| `T` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `Args`) => `T` |
| ...`item` | `Args` |

#### Returns

`T`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`create`](../../KubeObject/classes/KubeObject.md#create)

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
| `reqResourseAttrs`? | [`AuthRequestResourceAttrs`](../../KubeObject/interfaces/AuthRequestResourceAttrs.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`any`\>

The result of the access request.

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`fetchAuthorization`](../../KubeObject/classes/KubeObject.md#fetchauthorization)

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
| `reqResourseAttrs`? | [`AuthRequestResourceAttrs`](../../KubeObject/interfaces/AuthRequestResourceAttrs.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getAuthorization`](../../KubeObject/classes/KubeObject.md#getauthorization-1)

#### Defined in

[src/lib/k8s/KubeObject.ts:584](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L584)

***

### getBaseObject()

```ts
static getBaseObject(): KubeReplicaSet
```

#### Returns

[`KubeReplicaSet`](../interfaces/KubeReplicaSet.md)

#### Overrides

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getBaseObject`](../../KubeObject/classes/KubeObject.md#getbaseobject)

#### Defined in

[src/lib/k8s/replicaSet.ts:59](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/replicaSet.ts#L59)

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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getErrorMessage`](../../KubeObject/classes/KubeObject.md#geterrormessage)

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
| `K` *extends* *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | `K` | - |
| `maybeInstance` | [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> | The KubeObject instance to check. |

#### Returns

`maybeInstance is InstanceType<K>`

True if the instance is of this class type, with narrowed type.

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isClassOf`](../../KubeObject/classes/KubeObject.md#isclassof)

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
| `data` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`put`](../../KubeObject/classes/KubeObject.md#put)

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
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |
| `onGet` | (`item`: `null` \| `K`) => `any` |
| `name` | `string` |
| `namespace`? | `string` |
| `onError`? | (`err`: `null` \| [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster`?: `string`) => `void` |
| `opts`? | `object` |
| `opts.cluster`? | `string` |
| `opts.queryParams`? | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

`void`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useApiGet`](../../KubeObject/classes/KubeObject.md#useapiget)

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
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |
| `onList` | (...`arg`: `any`[]) => `any` |
| `onError`? | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster`?: `string`) => `void` |
| `opts`? | [`ApiListOptions`](../../KubeObject/interfaces/ApiListOptions.md) |

#### Returns

`void`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useApiList`](../../KubeObject/classes/KubeObject.md#useapilist)

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
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useGet`](../../KubeObject/classes/KubeObject.md#useget)

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
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |
| `__namedParameters` | `object` & [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

[`null` \| `K`[], `null` \| [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<(`undefined` \| `null` \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\>)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useList`](../../KubeObject/classes/KubeObject.md#uselist)

#### Defined in

[src/lib/k8s/KubeObject.ts:365](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L365)
