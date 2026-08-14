# Class: BackendTrafficPolicy

Defined in: [lib/k8s/backendTrafficPolicy.ts:98](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L98)

XBackendTrafficPolicy – Gateway API experimental resource that controls
client behaviour (retries, session stickiness, etc.) when talking to a
backend.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/specx/#xbackendtrafficpolicy](https://gateway-api.sigs.k8s.io/reference/api-spec/main/specx/#xbackendtrafficpolicy)

## Extends

- [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<[`KubeBackendTrafficPolicy`](../interfaces/KubeBackendTrafficPolicy.md)\>

## Constructors

### Constructor

```ts
new BackendTrafficPolicy(json: KubeBackendTrafficPolicy, cluster?: string): BackendTrafficPolicy;
```

Defined in: [lib/k8s/KubeObject.ts:102](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L102)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `json` | [`KubeBackendTrafficPolicy`](../interfaces/KubeBackendTrafficPolicy.md) |
| `cluster?` | `string` |

#### Returns

`BackendTrafficPolicy`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`constructor`](../../KubeObject/classes/KubeObject.md#constructor)

## Properties

| Property | Modifier | Type | Default value | Description | Overrides | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="property-_clustername"></a> `_clusterName` | `public` | `string` | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_clusterName`](../../KubeObject/classes/KubeObject.md#property-_clustername) | [lib/k8s/KubeObject.ts:52](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L52) |
| <a id="property-jsondata"></a> `jsonData` | `public` | [`KubeBackendTrafficPolicy`](../interfaces/KubeBackendTrafficPolicy.md) | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`jsonData`](../../KubeObject/classes/KubeObject.md#property-jsondata) | [lib/k8s/KubeObject.ts:49](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L49) |
| <a id="property-_internalapiendpoint"></a> `_internalApiEndpoint?` | `static` | \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_internalApiEndpoint`](../../KubeObject/classes/KubeObject.md#property-_internalapiendpoint) | [lib/k8s/KubeObject.ts:69](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L69) |
| <a id="property-apiname"></a> `apiName` | `static` | `string` | `'xbackendtrafficpolicies'` | Name of the resource, plural, used in API | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiName`](../../KubeObject/classes/KubeObject.md#property-apiname) | - | [lib/k8s/backendTrafficPolicy.ts:100](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L100) |
| <a id="property-apiversion"></a> `apiVersion` | `static` | `string`[] | `undefined` | Group and version of the resource formatted as "GROUP/VERSION", e.g. "policy.k8s.io/v1". | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiVersion`](../../KubeObject/classes/KubeObject.md#property-apiversion) | - | [lib/k8s/backendTrafficPolicy.ts:101](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L101) |
| <a id="property-isnamespaced"></a> `isNamespaced` | `static` | `boolean` | `true` | Whether the object is namespaced. | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isNamespaced`](../../KubeObject/classes/KubeObject.md#property-isnamespaced) | - | [lib/k8s/backendTrafficPolicy.ts:102](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L102) |
| <a id="property-isscalable"></a> `isScalable` | `readonly` | `boolean` | `undefined` | Whether the object is scalable, and should have a ScaleButton | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isScalable`](../../KubeObject/classes/KubeObject.md#property-isscalable) | [lib/k8s/KubeObject.ts:67](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L67) |
| <a id="property-kind"></a> `kind` | `static` | `string` | `'XBackendTrafficPolicy'` | The kind of the object. Corresponding to the resource kind in Kubernetes. | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`kind`](../../KubeObject/classes/KubeObject.md#property-kind) | - | [lib/k8s/backendTrafficPolicy.ts:99](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L99) |
| <a id="property-readonlyfields"></a> `readOnlyFields` | `static` | `string`[] | `[]` | Readonly field defined as JSONPath paths | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`readOnlyFields`](../../KubeObject/classes/KubeObject.md#property-readonlyfields) | [lib/k8s/KubeObject.ts:51](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L51) |

## Accessors

### cluster

#### Get Signature

```ts
get cluster(): string;
```

Defined in: [lib/k8s/KubeObject.ts:107](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L107)

##### Returns

`string`

#### Set Signature

```ts
set cluster(cluster: string): void;
```

Defined in: [lib/k8s/KubeObject.ts:111](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L111)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster` | `string` |

##### Returns

`void`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`cluster`](../../KubeObject/classes/KubeObject.md#cluster)

***

### detailsRoute

#### Get Signature

```ts
get detailsRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:119](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L119)

##### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`detailsRoute`](../../KubeObject/classes/KubeObject.md#detailsroute)

***

### isNamespaced

#### Get Signature

```ts
get isNamespaced(): boolean;
```

Defined in: [lib/k8s/KubeObject.ts:228](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L228)

##### Returns

`boolean`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isNamespaced`](../../KubeObject/classes/KubeObject.md#isnamespaced)

***

### isScalable

#### Get Signature

```ts
get isScalable(): boolean;
```

Defined in: [lib/k8s/KubeObject.ts:232](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L232)

##### Returns

`boolean`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isScalable`](../../KubeObject/classes/KubeObject.md#isscalable)

***

### kind

#### Get Signature

```ts
get kind(): any;
```

Defined in: [lib/k8s/KubeObject.ts:182](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L182)

##### Returns

`any`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`kind`](../../KubeObject/classes/KubeObject.md#kind)

***

### listRoute

#### Get Signature

```ts
get listRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:174](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L174)

##### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`listRoute`](../../KubeObject/classes/KubeObject.md#listroute)

***

### metadata

#### Get Signature

```ts
get metadata(): KubeMetadata;
```

Defined in: [lib/k8s/KubeObject.ts:224](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L224)

##### Returns

[`KubeMetadata`](../../KubeMetadata/interfaces/KubeMetadata.md)

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`metadata`](../../KubeObject/classes/KubeObject.md#metadata)

***

### pluralName

#### Get Signature

```ts
get pluralName(): string;
```

Defined in: [lib/k8s/KubeObject.ts:169](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L169)

##### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`pluralName`](../../KubeObject/classes/KubeObject.md#pluralname)

***

### retryConstraint

#### Get Signature

```ts
get retryConstraint(): RetryConstraint | undefined;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:112](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L112)

##### Returns

[`RetryConstraint`](../interfaces/RetryConstraint.md) \| `undefined`

***

### sessionPersistence

#### Get Signature

```ts
get sessionPersistence(): SessionPersistence | undefined;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:116](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L116)

##### Returns

[`SessionPersistence`](../interfaces/SessionPersistence.md) \| `undefined`

***

### spec

#### Get Signature

```ts
get spec(): BackendTrafficPolicySpec;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:104](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L104)

##### Returns

[`BackendTrafficPolicySpec`](../interfaces/BackendTrafficPolicySpec.md)

***

### targetRefs

#### Get Signature

```ts
get targetRefs(): BackendTrafficPolicyTargetRef[];
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:108](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L108)

##### Returns

[`BackendTrafficPolicyTargetRef`](../interfaces/BackendTrafficPolicyTargetRef.md)[]

***

### apiEndpoint

#### Get Signature

```ts
get static apiEndpoint(): 
  | ApiClient<KubeObjectInterface>
| ApiWithNamespaceClient<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:71](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L71)

##### Returns

  \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>
  \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Set Signature

```ts
set static apiEndpoint(endpoint: 
  | ApiClient<KubeObjectInterface>
  | ApiWithNamespaceClient<KubeObjectInterface>): void;
```

Defined in: [lib/k8s/KubeObject.ts:98](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L98)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `endpoint` | \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> |

##### Returns

`void`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiEndpoint`](../../KubeObject/classes/KubeObject.md#apiendpoint)

***

### apiGroupName

#### Get Signature

```ts
get static apiGroupName(): string | undefined;
```

Defined in: [lib/k8s/KubeObject.ts:135](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L135)

Get name of the API group of this resource
for example will return batch for CronJob

For core group, like Pods, it will return undefined

API group reference https://kubernetes.io/docs/reference/using-api/#api-groups

##### Returns

`string` \| `undefined`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiGroupName`](../../KubeObject/classes/KubeObject.md#apigroupname)

***

### className

#### Get Signature

```ts
get static className(): string;
```

Defined in: [lib/k8s/KubeObject.ts:115](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L115)

##### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`className`](../../KubeObject/classes/KubeObject.md#classname)

***

### detailsRoute

#### Get Signature

```ts
get static detailsRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:123](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L123)

##### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`detailsRoute`](../../KubeObject/classes/KubeObject.md#detailsroute-1)

***

### listRoute

#### Get Signature

```ts
get static listRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:178](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L178)

##### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`listRoute`](../../KubeObject/classes/KubeObject.md#listroute-1)

***

### pluralName

#### Get Signature

```ts
get static pluralName(): string;
```

Defined in: [lib/k8s/backendTrafficPolicy.ts:120](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTrafficPolicy.ts#L120)

##### Returns

`string`

#### Overrides

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`pluralName`](../../KubeObject/classes/KubeObject.md#pluralname-1)

## Methods

### \_class()

```ts
_class(): typeof KubeObject;
```

Defined in: [lib/k8s/KubeObject.ts:381](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L381)

#### Returns

*typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md)

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_class`](../../KubeObject/classes/KubeObject.md#_class)

***

### delete()

```ts
delete(force?: boolean): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:385](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L385)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `force?` | `boolean` |

#### Returns

`Promise`\<`any`\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`delete`](../../KubeObject/classes/KubeObject.md#delete)

***

### getAge()

```ts
getAge(): string;
```

Defined in: [lib/k8s/KubeObject.ts:216](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L216)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getAge`](../../KubeObject/classes/KubeObject.md#getage)

***

### getAuthorization()

```ts
getAuthorization(verb: string, reqResourseAttrs?: AuthRequestResourceAttrs): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:581](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L581)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `verb` | `string` |
| `reqResourseAttrs?` | [`AuthRequestResourceAttrs`](../../KubeObject/interfaces/AuthRequestResourceAttrs.md) |

#### Returns

`Promise`\<`any`\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getAuthorization`](../../KubeObject/classes/KubeObject.md#getauthorization)

***

### getCreationTs()

```ts
getCreationTs(): string;
```

Defined in: [lib/k8s/KubeObject.ts:212](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L212)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getCreationTs`](../../KubeObject/classes/KubeObject.md#getcreationts)

***

### getDetailsLink()

```ts
getDetailsLink(): string;
```

Defined in: [lib/k8s/KubeObject.ts:186](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L186)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getDetailsLink`](../../KubeObject/classes/KubeObject.md#getdetailslink)

***

### getEditableObject()

```ts
getEditableObject(): object;
```

Defined in: [lib/k8s/KubeObject.ts:236](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L236)

#### Returns

`object`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getEditableObject`](../../KubeObject/classes/KubeObject.md#geteditableobject)

***

### getListLink()

```ts
getListLink(): string;
```

Defined in: [lib/k8s/KubeObject.ts:200](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L200)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getListLink`](../../KubeObject/classes/KubeObject.md#getlistlink)

***

### getName()

```ts
getName(): string;
```

Defined in: [lib/k8s/KubeObject.ts:204](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L204)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getName`](../../KubeObject/classes/KubeObject.md#getname)

***

### getNamespace()

```ts
getNamespace(): string | undefined;
```

Defined in: [lib/k8s/KubeObject.ts:208](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L208)

#### Returns

`string` \| `undefined`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getNamespace`](../../KubeObject/classes/KubeObject.md#getnamespace)

***

### getValue()

```ts
getValue(prop: string): any;
```

Defined in: [lib/k8s/KubeObject.ts:220](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L220)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `prop` | `string` |

#### Returns

`any`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getValue`](../../KubeObject/classes/KubeObject.md#getvalue)

***

### patch()

```ts
patch(body: RecursivePartial<T>): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:489](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L489)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`RecursivePartial`](../../api/v1/factories/type-aliases/RecursivePartial.md)\<`T`\> |

#### Returns

`Promise`\<`any`\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`patch`](../../KubeObject/classes/KubeObject.md#patch)

***

### patchUpdate()

```ts
patchUpdate(original: KubeObjectInterface, modified: KubeObjectInterface): Promise<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:413](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L413)

Updates a resource using JSON Patch (RFC 6902), sending only the diff between
the original and modified objects. This avoids 409 Conflict errors on resources
that are frequently updated by controllers (e.g. HPA).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `original` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |
| `modified` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`patchUpdate`](../../KubeObject/classes/KubeObject.md#patchupdate)

***

### scale()

```ts
scale(numReplicas: number): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:460](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L460)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `numReplicas` | `number` |

#### Returns

`Promise`\<`any`\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`scale`](../../KubeObject/classes/KubeObject.md#scale)

***

### update()

```ts
update(data: KubeObjectInterface): Promise<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:404](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L404)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`update`](../../KubeObject/classes/KubeObject.md#update)

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

Defined in: [lib/k8s/KubeObject.ts:342](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L342)

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
| `namespace?` | `string` |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`, `cluster?`: `string`) => `void` |
| `opts?` | \{ `cluster?`: `string`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `opts.cluster?` | `string` |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

(...`args`: `any`[]) => `Promise`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiGet`](../../KubeObject/classes/KubeObject.md#apiget)

***

### apiList()

```ts
static apiList<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onList: (arg: K[]) => void, 
   onError?: (err: ApiError, cluster?: string) => void, 
opts?: ApiListSingleNamespaceOptions): () => Promise<CancelFunction>;
```

Defined in: [lib/k8s/KubeObject.ts:266](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L266)

Builds a list request for this object's API endpoint.

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) | - |
| `onList` | (`arg`: `K`[]) => `void` | Callback function to be called when the list is retrieved. |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster?`: `string`) => `void` | Callback function to be called when an error occurs. |
| `opts?` | [`ApiListSingleNamespaceOptions`](../../KubeObject/interfaces/ApiListSingleNamespaceOptions.md) | Options to be passed to the API endpoint. |

#### Returns

A parameterless function that starts the list request and resolves
         to a [CancelFunction](../../api/v1/factories/type-aliases/CancelFunction.md) for stopping it.

() => `Promise`\<[`CancelFunction`](../../api/v1/factories/type-aliases/CancelFunction.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiList`](../../KubeObject/classes/KubeObject.md#apilist)

***

### create()

```ts
static create<Args, T>(this: (...args: Args) => T, ...item: Args): T;
```

Defined in: [lib/k8s/KubeObject.ts:335](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L335)

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

***

### fetchAuthorization()

```ts
static fetchAuthorization(reqResourseAttrs?: AuthRequestResourceAttrs, cluster?: string): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:506](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L506)

Performs a request to check if the user has the given permission.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `reqResourseAttrs?` | [`AuthRequestResourceAttrs`](../../KubeObject/interfaces/AuthRequestResourceAttrs.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`any`\>

The result of the access request.

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`fetchAuthorization`](../../KubeObject/classes/KubeObject.md#fetchauthorization)

***

### getAuthorization()

```ts
static getAuthorization(
   verb: string, 
   reqResourseAttrs?: AuthRequestResourceAttrs, 
cluster?: string): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:534](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L534)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `verb` | `string` |
| `reqResourseAttrs?` | [`AuthRequestResourceAttrs`](../../KubeObject/interfaces/AuthRequestResourceAttrs.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`any`\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getAuthorization`](../../KubeObject/classes/KubeObject.md#getauthorization-1)

***

### getBaseObject()

```ts
static getBaseObject(): Omit<KubeObjectInterface, "metadata"> & object;
```

Defined in: [lib/k8s/KubeObject.ts:625](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L625)

#### Returns

`Omit`\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md), `"metadata"`\> & `object`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getBaseObject`](../../KubeObject/classes/KubeObject.md#getbaseobject)

***

### getErrorMessage()

```ts
static getErrorMessage(err: ApiError | null): "Error" | "Error: Not found" | "Error: No permissions" | null;
```

Defined in: [lib/k8s/KubeObject.ts:610](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L610)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null` |

#### Returns

`"Error"` \| `"Error: Not found"` \| `"Error: No permissions"` \| `null`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getErrorMessage`](../../KubeObject/classes/KubeObject.md#geterrormessage)

***

### isClassOf()

```ts
static isClassOf<K>(this: K, maybeInstance: KubeObject): maybeInstance is InstanceType<K>;
```

Defined in: [lib/k8s/KubeObject.ts:154](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L154)

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
| `maybeInstance` | [`KubeObject`](../../KubeObject/classes/KubeObject.md) | The KubeObject instance to check. |

#### Returns

`maybeInstance is InstanceType<K>`

True if the instance is of this class type, with narrowed type.

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isClassOf`](../../KubeObject/classes/KubeObject.md#isclassof)

***

### put()

```ts
static put(data: KubeObjectInterface): Promise<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:456](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L456)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`put`](../../KubeObject/classes/KubeObject.md#put)

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

Defined in: [lib/k8s/KubeObject.ts:367](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L367)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |
| `onGet` | (`item`: `K` \| `null`) => `any` |
| `name` | `string` |
| `namespace?` | `string` |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`, `cluster?`: `string`) => `void` |
| `opts?` | \{ `cluster?`: `string`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `opts.cluster?` | `string` |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

`void`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useApiGet`](../../KubeObject/classes/KubeObject.md#useapiget)

***

### useApiList()

```ts
static useApiList<K>(
   this: (...args: any) => K & typeof KubeObject, 
   onList: (...arg: any[]) => any, 
   onError?: (err: ApiError, cluster?: string) => void, 
   opts?: ApiListOptions): void;
```

Defined in: [lib/k8s/KubeObject.ts:301](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L301)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |
| `onList` | (...`arg`: `any`[]) => `any` |
| `onError?` | (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster?`: `string`) => `void` |
| `opts?` | [`ApiListOptions`](../../KubeObject/interfaces/ApiListOptions.md) |

#### Returns

`void`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useApiList`](../../KubeObject/classes/KubeObject.md#useapilist)

***

### useGet()

```ts
static useGet<K>(
   this: (...args: any) => K & typeof KubeObject, 
   name: string, 
   namespace?: string, 
opts?: object): [K | null, ApiError | null] & QueryResponse<K, ApiError>;
```

Defined in: [lib/k8s/KubeObject.ts:323](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L323)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |
| `name` | `string` |
| `namespace?` | `string` |
| `opts?` | \{ `cluster?`: `string`; `queryParams?`: [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md); \} |
| `opts.cluster?` | `string` |
| `opts.queryParams?` | [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

\[`K` \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryResponse`](../../api/v2/hooks/interfaces/QueryResponse.md)\<`K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useGet`](../../KubeObject/classes/KubeObject.md#useget)

***

### useList()

```ts
static useList<K>(this: (...args: any) => K & typeof KubeObject, opts?: object & QueryParameters): [K[] | null, ApiError | null] & QueryListResponse<(
  | ListResponse<K>
  | null
| undefined)[], K, ApiError>;
```

Defined in: [lib/k8s/KubeObject.ts:310](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L310)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `this` | (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md) |
| `opts` | `object` & [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md) |

#### Returns

\[`K`[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<(
  \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\>
  \| `null`
  \| `undefined`)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useList`](../../KubeObject/classes/KubeObject.md#uselist)
