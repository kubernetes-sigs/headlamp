# Class: IngressClass

Defined in: [lib/k8s/ingressClass.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L27)

## Extends

- [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<[`KubeIngressClass`](../interfaces/KubeIngressClass.md)\>

## Constructors

### Constructor

```ts
new IngressClass(json: KubeIngressClass, cluster?: string): IngressClass;
```

Defined in: [lib/k8s/KubeObject.ts:179](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L179)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `json` | [`KubeIngressClass`](../interfaces/KubeIngressClass.md) |
| `cluster?` | `string` |

#### Returns

`IngressClass`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`constructor`](../../KubeObject/classes/KubeObject.md#constructor)

## Properties

| Property | Modifier | Type | Default value | Description | Overrides | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="property-_clustername"></a> `_clusterName` | `public` | `string` | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_clusterName`](../../KubeObject/classes/KubeObject.md#property-_clustername) | [lib/k8s/KubeObject.ts:129](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L129) |
| <a id="property-jsondata"></a> `jsonData` | `public` | [`KubeIngressClass`](../interfaces/KubeIngressClass.md) | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`jsonData`](../../KubeObject/classes/KubeObject.md#property-jsondata) | [lib/k8s/KubeObject.ts:126](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L126) |
| <a id="property-_internalapiendpoint"></a> `_internalApiEndpoint?` | `static` | \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_internalApiEndpoint`](../../KubeObject/classes/KubeObject.md#property-_internalapiendpoint) | [lib/k8s/KubeObject.ts:146](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L146) |
| <a id="property-apiname"></a> `apiName` | `static` | `string` | `'ingressclasses'` | Name of the resource, plural, used in API | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiName`](../../KubeObject/classes/KubeObject.md#property-apiname) | - | [lib/k8s/ingressClass.ts:29](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L29) |
| <a id="property-apiversion"></a> `apiVersion` | `static` | `string` | `'networking.k8s.io/v1'` | Group and version of the resource formatted as "GROUP/VERSION", e.g. "policy.k8s.io/v1". | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiVersion`](../../KubeObject/classes/KubeObject.md#property-apiversion) | - | [lib/k8s/ingressClass.ts:30](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L30) |
| <a id="property-isnamespaced"></a> `isNamespaced` | `static` | `boolean` | `false` | Whether the object is namespaced. | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isNamespaced`](../../KubeObject/classes/KubeObject.md#property-isnamespaced) | - | [lib/k8s/ingressClass.ts:31](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L31) |
| <a id="property-isscalable"></a> `isScalable` | `readonly` | `boolean` | `undefined` | Whether the object is scalable, and should have a ScaleButton | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isScalable`](../../KubeObject/classes/KubeObject.md#property-isscalable) | [lib/k8s/KubeObject.ts:144](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L144) |
| <a id="property-kind"></a> `kind` | `static` | `string` | `'IngressClass'` | The kind of the object. Corresponding to the resource kind in Kubernetes. | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`kind`](../../KubeObject/classes/KubeObject.md#property-kind) | - | [lib/k8s/ingressClass.ts:28](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L28) |
| <a id="property-readonlyfields"></a> `readOnlyFields` | `static` | `string`[] | `[]` | Readonly field defined as JSONPath paths | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`readOnlyFields`](../../KubeObject/classes/KubeObject.md#property-readonlyfields) | [lib/k8s/KubeObject.ts:128](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L128) |
| <a id="property-useapilist"></a> ~~`useApiList`~~ | `static` | \<`K`\>(`this`: (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md), `_onList?`: (...`arg`: `any`[]) => `any`, `_onError?`: (`err`: [`ApiError`](../../api/v2/ApiError/classes/ApiError.md), `cluster?`: `string`) => `void`, `opts?`: [`ApiListOptions`](../../KubeObject/interfaces/ApiListOptions.md)) => \[`K`[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<( \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\> \| `null` \| `undefined`)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\> | `undefined` | **Deprecated** Use the standalone `useKubeList` hook instead. Kept for backward compatibility with existing plugins that call `SomeResource.useApiList(...)` on the loaded SDK object. | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useApiList`](../../KubeObject/classes/KubeObject.md#property-useapilist) | [lib/k8s/KubeObject.ts:390](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L390) |
| <a id="property-useget"></a> `useGet` | `static` | \<`K`\>(`this`: (...`args`: `any`) => `K`, `name`: `string`, `namespace?`: `string`, `opts?`: `object`) => \[`K` \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryResponse`](../../api/v2/hooks/interfaces/QueryResponse.md)\<`K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\> | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useGet`](../../KubeObject/classes/KubeObject.md#property-useget) | [lib/k8s/KubeObject.ts:399](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L399) |
| <a id="property-uselist"></a> `useList` | `static` | \<`K`\>(`this`: (...`args`: `any`) => `K` & *typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md), `options?`: `object` & [`QueryParameters`](../../api/v1/queryParameters/interfaces/QueryParameters.md)) => \[`K`[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<( \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\> \| `null` \| `undefined`)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\> | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useList`](../../KubeObject/classes/KubeObject.md#property-uselist) | [lib/k8s/KubeObject.ts:378](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L378) |

## Accessors

### cluster

#### Get Signature

```ts
get cluster(): string;
```

Defined in: [lib/k8s/KubeObject.ts:184](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L184)

##### Returns

`string`

#### Set Signature

```ts
set cluster(cluster: string): void;
```

Defined in: [lib/k8s/KubeObject.ts:188](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L188)

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

Defined in: [lib/k8s/KubeObject.ts:196](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L196)

##### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`detailsRoute`](../../KubeObject/classes/KubeObject.md#detailsroute)

***

### isDefault

#### Get Signature

```ts
get isDefault(): boolean;
```

Defined in: [lib/k8s/ingressClass.ts:43](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L43)

##### Returns

`boolean`

***

### isNamespaced

#### Get Signature

```ts
get isNamespaced(): boolean;
```

Defined in: [lib/k8s/KubeObject.ts:305](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L305)

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

Defined in: [lib/k8s/KubeObject.ts:309](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L309)

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

Defined in: [lib/k8s/KubeObject.ts:259](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L259)

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

Defined in: [lib/k8s/KubeObject.ts:251](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L251)

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

Defined in: [lib/k8s/KubeObject.ts:301](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L301)

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

Defined in: [lib/k8s/KubeObject.ts:246](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L246)

##### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`pluralName`](../../KubeObject/classes/KubeObject.md#pluralname)

***

### spec

#### Get Signature

```ts
get spec(): object;
```

Defined in: [lib/k8s/ingressClass.ts:39](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L39)

##### Returns

`object`

###### controller

```ts
controller: string;
```

***

### apiEndpoint

#### Get Signature

```ts
get static apiEndpoint(): 
  | ApiClient<KubeObjectInterface>
| ApiWithNamespaceClient<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:148](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L148)

##### Returns

  \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>
  \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Set Signature

```ts
set static apiEndpoint(endpoint: 
  | ApiClient<KubeObjectInterface>
  | ApiWithNamespaceClient<KubeObjectInterface>): void;
```

Defined in: [lib/k8s/KubeObject.ts:175](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L175)

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

Defined in: [lib/k8s/KubeObject.ts:212](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L212)

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

Defined in: [lib/k8s/KubeObject.ts:192](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L192)

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

Defined in: [lib/k8s/KubeObject.ts:200](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L200)

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

Defined in: [lib/k8s/ingressClass.ts:51](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L51)

##### Returns

`string`

#### Overrides

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`listRoute`](../../KubeObject/classes/KubeObject.md#listroute-1)

***

### pluralName

#### Get Signature

```ts
get static pluralName(): string;
```

Defined in: [lib/k8s/ingressClass.ts:55](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L55)

##### Returns

`string`

#### Overrides

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`pluralName`](../../KubeObject/classes/KubeObject.md#pluralname-1)

## Methods

### \_class()

```ts
_class(): typeof KubeObject;
```

Defined in: [lib/k8s/KubeObject.ts:449](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L449)

#### Returns

*typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md)

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_class`](../../KubeObject/classes/KubeObject.md#_class)

***

### delete()

```ts
delete(force?: boolean): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:453](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L453)

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

Defined in: [lib/k8s/KubeObject.ts:293](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L293)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getAge`](../../KubeObject/classes/KubeObject.md#getage)

***

### getAuthorization()

```ts
getAuthorization(verb: string, reqResourseAttrs?: AuthRequestResourceAttrs): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:649](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L649)

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

Defined in: [lib/k8s/KubeObject.ts:289](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L289)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getCreationTs`](../../KubeObject/classes/KubeObject.md#getcreationts)

***

### getDetailsLink()

```ts
getDetailsLink(): string;
```

Defined in: [lib/k8s/KubeObject.ts:263](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L263)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getDetailsLink`](../../KubeObject/classes/KubeObject.md#getdetailslink)

***

### getEditableObject()

```ts
getEditableObject(): object;
```

Defined in: [lib/k8s/KubeObject.ts:313](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L313)

#### Returns

`object`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getEditableObject`](../../KubeObject/classes/KubeObject.md#geteditableobject)

***

### getListLink()

```ts
getListLink(): string;
```

Defined in: [lib/k8s/KubeObject.ts:277](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L277)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getListLink`](../../KubeObject/classes/KubeObject.md#getlistlink)

***

### getName()

```ts
getName(): string;
```

Defined in: [lib/k8s/KubeObject.ts:281](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L281)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getName`](../../KubeObject/classes/KubeObject.md#getname)

***

### getNamespace()

```ts
getNamespace(): string | undefined;
```

Defined in: [lib/k8s/KubeObject.ts:285](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L285)

#### Returns

`string` \| `undefined`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getNamespace`](../../KubeObject/classes/KubeObject.md#getnamespace)

***

### getValue()

```ts
getValue(prop: string): any;
```

Defined in: [lib/k8s/KubeObject.ts:297](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L297)

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

Defined in: [lib/k8s/KubeObject.ts:557](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L557)

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

Defined in: [lib/k8s/KubeObject.ts:481](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L481)

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

Defined in: [lib/k8s/KubeObject.ts:528](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L528)

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

Defined in: [lib/k8s/KubeObject.ts:472](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L472)

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

Defined in: [lib/k8s/KubeObject.ts:424](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L424)

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

Defined in: [lib/k8s/KubeObject.ts:343](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L343)

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

Defined in: [lib/k8s/KubeObject.ts:417](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L417)

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

Defined in: [lib/k8s/KubeObject.ts:574](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L574)

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

Defined in: [lib/k8s/KubeObject.ts:602](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L602)

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
static getBaseObject(): KubeIngressClass;
```

Defined in: [lib/k8s/ingressClass.ts:33](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/ingressClass.ts#L33)

#### Returns

[`KubeIngressClass`](../interfaces/KubeIngressClass.md)

#### Overrides

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getBaseObject`](../../KubeObject/classes/KubeObject.md#getbaseobject)

***

### getErrorMessage()

```ts
static getErrorMessage(err: ApiError | null): "Error" | "Error: Not found" | "Error: No permissions" | null;
```

Defined in: [lib/k8s/KubeObject.ts:678](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L678)

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

Defined in: [lib/k8s/KubeObject.ts:231](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L231)

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

Defined in: [lib/k8s/KubeObject.ts:524](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L524)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md) |

#### Returns

`Promise`\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`put`](../../KubeObject/classes/KubeObject.md#put)
