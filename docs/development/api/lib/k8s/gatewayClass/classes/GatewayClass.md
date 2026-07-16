# Class: GatewayClass

Defined in: [lib/k8s/gatewayClass.ts:39](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L39)

## Extends

- [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<[`KubeGatewayClass`](../interfaces/KubeGatewayClass.md)\>

## Constructors

### Constructor

```ts
new GatewayClass(json: KubeGatewayClass, cluster?: string): GatewayClass;
```

Defined in: [lib/k8s/KubeObject.ts:106](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L106)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `json` | [`KubeGatewayClass`](../interfaces/KubeGatewayClass.md) |
| `cluster?` | `string` |

#### Returns

`GatewayClass`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`constructor`](../../KubeObject/classes/KubeObject.md#constructor)

## Properties

| Property | Modifier | Type | Default value | Description | Overrides | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="property-_clustername"></a> `_clusterName` | `public` | `string` | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_clusterName`](../../KubeObject/classes/KubeObject.md#property-_clustername) | [lib/k8s/KubeObject.ts:56](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L56) |
| <a id="property-jsondata"></a> `jsonData` | `public` | [`KubeGatewayClass`](../interfaces/KubeGatewayClass.md) | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`jsonData`](../../KubeObject/classes/KubeObject.md#property-jsondata) | [lib/k8s/KubeObject.ts:53](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L53) |
| <a id="property-_internalapiendpoint"></a> `_internalApiEndpoint?` | `static` | \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\> | `undefined` | - | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_internalApiEndpoint`](../../KubeObject/classes/KubeObject.md#property-_internalapiendpoint) | [lib/k8s/KubeObject.ts:73](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L73) |
| <a id="property-apiname"></a> `apiName` | `static` | `string` | `'gatewayclasses'` | Name of the resource, plural, used in API | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiName`](../../KubeObject/classes/KubeObject.md#property-apiname) | - | [lib/k8s/gatewayClass.ts:41](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L41) |
| <a id="property-apiversion"></a> `apiVersion` | `static` | `string`[] | `undefined` | Group and version of the resource formatted as "GROUP/VERSION", e.g. "policy.k8s.io/v1". | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`apiVersion`](../../KubeObject/classes/KubeObject.md#property-apiversion) | - | [lib/k8s/gatewayClass.ts:42](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L42) |
| <a id="property-isnamespaced"></a> `isNamespaced` | `static` | `boolean` | `false` | Whether the object is namespaced. | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isNamespaced`](../../KubeObject/classes/KubeObject.md#property-isnamespaced) | - | [lib/k8s/gatewayClass.ts:43](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L43) |
| <a id="property-isscalable"></a> `isScalable` | `readonly` | `boolean` | `undefined` | Whether the object is scalable, and should have a ScaleButton | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`isScalable`](../../KubeObject/classes/KubeObject.md#property-isscalable) | [lib/k8s/KubeObject.ts:71](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L71) |
| <a id="property-kind"></a> `kind` | `static` | `string` | `'GatewayClass'` | The kind of the object. Corresponding to the resource kind in Kubernetes. | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`kind`](../../KubeObject/classes/KubeObject.md#property-kind) | - | [lib/k8s/gatewayClass.ts:40](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L40) |
| <a id="property-readonlyfields"></a> `readOnlyFields` | `static` | `string`[] | `[]` | Readonly field defined as JSONPath paths | - | [`KubeObject`](../../KubeObject/classes/KubeObject.md).[`readOnlyFields`](../../KubeObject/classes/KubeObject.md#property-readonlyfields) | [lib/k8s/KubeObject.ts:55](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L55) |

## Accessors

### cluster

#### Get Signature

```ts
get cluster(): string;
```

Defined in: [lib/k8s/KubeObject.ts:111](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L111)

##### Returns

`string`

#### Set Signature

```ts
set cluster(cluster: string): void;
```

Defined in: [lib/k8s/KubeObject.ts:115](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L115)

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `cluster` | `string` |

##### Returns

`void`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`cluster`](../../KubeObject/classes/KubeObject.md#cluster)

***

### controllerName

#### Get Signature

```ts
get controllerName(): string;
```

Defined in: [lib/k8s/gatewayClass.ts:53](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L53)

##### Returns

`string`

***

### detailsRoute

#### Get Signature

```ts
get detailsRoute(): string;
```

Defined in: [lib/k8s/KubeObject.ts:123](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L123)

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

Defined in: [lib/k8s/KubeObject.ts:231](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L231)

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

Defined in: [lib/k8s/KubeObject.ts:235](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L235)

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

Defined in: [lib/k8s/KubeObject.ts:185](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L185)

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

Defined in: [lib/k8s/KubeObject.ts:177](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L177)

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

Defined in: [lib/k8s/KubeObject.ts:227](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L227)

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

Defined in: [lib/k8s/KubeObject.ts:172](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L172)

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

Defined in: [lib/k8s/gatewayClass.ts:45](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L45)

##### Returns

`object`

###### controllerName

```ts
controllerName: string;
```

***

### status

#### Get Signature

```ts
get status(): object;
```

Defined in: [lib/k8s/gatewayClass.ts:49](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L49)

##### Returns

`object`

###### conditions?

```ts
optional conditions?: KubeCondition[];
```

***

### apiEndpoint

#### Get Signature

```ts
get static apiEndpoint(): 
  | ApiClient<KubeObjectInterface>
| ApiWithNamespaceClient<KubeObjectInterface>;
```

Defined in: [lib/k8s/KubeObject.ts:75](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L75)

##### Returns

  \| [`ApiClient`](../../api/v1/factories/interfaces/ApiClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>
  \| [`ApiWithNamespaceClient`](../../api/v1/factories/interfaces/ApiWithNamespaceClient.md)\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md)\>

#### Set Signature

```ts
set static apiEndpoint(endpoint: 
  | ApiClient<KubeObjectInterface>
  | ApiWithNamespaceClient<KubeObjectInterface>): void;
```

Defined in: [lib/k8s/KubeObject.ts:102](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L102)

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

Defined in: [lib/k8s/KubeObject.ts:139](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L139)

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

Defined in: [lib/k8s/KubeObject.ts:119](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L119)

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

Defined in: [lib/k8s/KubeObject.ts:127](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L127)

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

Defined in: [lib/k8s/gatewayClass.ts:57](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L57)

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

Defined in: [lib/k8s/gatewayClass.ts:61](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/gatewayClass.ts#L61)

##### Returns

`string`

#### Overrides

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`pluralName`](../../KubeObject/classes/KubeObject.md#pluralname-1)

## Methods

### \_class()

```ts
_class(): typeof KubeObject;
```

Defined in: [lib/k8s/KubeObject.ts:497](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L497)

#### Returns

*typeof* [`KubeObject`](../../KubeObject/classes/KubeObject.md)

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`_class`](../../KubeObject/classes/KubeObject.md#_class)

***

### delete()

```ts
delete(force?: boolean): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:501](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L501)

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

Defined in: [lib/k8s/KubeObject.ts:219](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L219)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getAge`](../../KubeObject/classes/KubeObject.md#getage)

***

### getAuthorization()

```ts
getAuthorization(verb: string, reqResourseAttrs?: AuthRequestResourceAttrs): Promise<any>;
```

Defined in: [lib/k8s/KubeObject.ts:697](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L697)

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

Defined in: [lib/k8s/KubeObject.ts:215](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L215)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getCreationTs`](../../KubeObject/classes/KubeObject.md#getcreationts)

***

### getDetailsLink()

```ts
getDetailsLink(): string;
```

Defined in: [lib/k8s/KubeObject.ts:189](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L189)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getDetailsLink`](../../KubeObject/classes/KubeObject.md#getdetailslink)

***

### getEditableObject()

```ts
getEditableObject(): object;
```

Defined in: [lib/k8s/KubeObject.ts:239](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L239)

#### Returns

`object`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getEditableObject`](../../KubeObject/classes/KubeObject.md#geteditableobject)

***

### getListLink()

```ts
getListLink(): string;
```

Defined in: [lib/k8s/KubeObject.ts:203](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L203)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getListLink`](../../KubeObject/classes/KubeObject.md#getlistlink)

***

### getName()

```ts
getName(): string;
```

Defined in: [lib/k8s/KubeObject.ts:207](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L207)

#### Returns

`string`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getName`](../../KubeObject/classes/KubeObject.md#getname)

***

### getNamespace()

```ts
getNamespace(): string | undefined;
```

Defined in: [lib/k8s/KubeObject.ts:211](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L211)

#### Returns

`string` \| `undefined`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getNamespace`](../../KubeObject/classes/KubeObject.md#getnamespace)

***

### getValue()

```ts
getValue(prop: string): any;
```

Defined in: [lib/k8s/KubeObject.ts:223](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L223)

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

Defined in: [lib/k8s/KubeObject.ts:605](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L605)

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

Defined in: [lib/k8s/KubeObject.ts:529](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L529)

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

Defined in: [lib/k8s/KubeObject.ts:576](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L576)

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

Defined in: [lib/k8s/KubeObject.ts:520](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L520)

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

Defined in: [lib/k8s/KubeObject.ts:454](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L454)

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

Defined in: [lib/k8s/KubeObject.ts:269](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L269)

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

Defined in: [lib/k8s/KubeObject.ts:447](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L447)

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

Defined in: [lib/k8s/KubeObject.ts:622](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L622)

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

Defined in: [lib/k8s/KubeObject.ts:650](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L650)

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

Defined in: [lib/k8s/KubeObject.ts:741](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L741)

#### Returns

`Omit`\<[`KubeObjectInterface`](../../KubeObject/interfaces/KubeObjectInterface.md), `"metadata"`\> & `object`

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`getBaseObject`](../../KubeObject/classes/KubeObject.md#getbaseobject)

***

### getErrorMessage()

```ts
static getErrorMessage(err: ApiError | null): "Error" | "Error: Not found" | "Error: No permissions" | null;
```

Defined in: [lib/k8s/KubeObject.ts:726](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L726)

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

Defined in: [lib/k8s/KubeObject.ts:157](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L157)

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

Defined in: [lib/k8s/KubeObject.ts:572](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L572)

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

Defined in: [lib/k8s/KubeObject.ts:479](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L479)

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

Defined in: [lib/k8s/KubeObject.ts:304](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L304)

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
   this: (...args: any) => K, 
   name: string, 
   namespace?: string, 
opts?: object): [K | null, ApiError | null] & QueryResponse<K, ApiError>;
```

Defined in: [lib/k8s/KubeObject.ts:428](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L428)

#### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../KubeObject/classes/KubeObject.md)\<`any`\> |

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

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useGet`](../../KubeObject/classes/KubeObject.md#useget)

***

### useList()

```ts
static useList<K>(this: (...args: any) => K & typeof KubeObject, __namedParameters?: object & QueryParameters): [K[] | null, ApiError | null] & QueryListResponse<(
  | ListResponse<K>
  | null
| undefined)[], K, ApiError>;
```

Defined in: [lib/k8s/KubeObject.ts:375](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L375)

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

\[`K`[] \| `null`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md) \| `null`\] & [`QueryListResponse`](../../api/v2/hooks/interfaces/QueryListResponse.md)\<(
  \| [`ListResponse`](../../api/v2/useKubeObjectList/interfaces/ListResponse.md)\<`K`\>
  \| `null`
  \| `undefined`)[], `K`, [`ApiError`](../../api/v2/ApiError/classes/ApiError.md)\>

#### Inherited from

[`KubeObject`](../../KubeObject/classes/KubeObject.md).[`useList`](../../KubeObject/classes/KubeObject.md#uselist)
