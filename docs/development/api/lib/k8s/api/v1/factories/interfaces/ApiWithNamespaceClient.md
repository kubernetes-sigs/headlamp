# Interface: ApiWithNamespaceClient\<ResourceType\>

Defined in: [lib/k8s/api/v1/factories.ts:104](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L104)

## Type Parameters

| Type Parameter |
| ------ |
| `ResourceType` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Properties

### apiInfo

```ts
apiInfo: object[];
```

Defined in: [lib/k8s/api/v1/factories.ts:152](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L152)

#### group

```ts
group: string;
```

#### resource

```ts
resource: string;
```

#### version

```ts
version: string;
```

***

### delete

```ts
delete: (namespace: string, name: string, deleteParams?: DeleteParameters, cluster?: string) => Promise<any>;
```

Defined in: [lib/k8s/api/v1/factories.ts:145](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L145)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `namespace` | `string` |
| `name` | `string` |
| `deleteParams?` | [`DeleteParameters`](../../deleteParameters/interfaces/DeleteParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`any`\>

***

### get

```ts
get: (namespace: string, name: string, cb: StreamResultsCb<ResourceType>, errCb: StreamErrCb, queryParams?: QueryParameters, cluster?: string) => Promise<CancelFunction>;
```

Defined in: [lib/k8s/api/v1/factories.ts:112](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L112)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `namespace` | `string` |
| `name` | `string` |
| `cb` | [`StreamResultsCb`](../../streamingApi/type-aliases/StreamResultsCb.md)\<`ResourceType`\> |
| `errCb` | [`StreamErrCb`](../../streamingApi/type-aliases/StreamErrCb.md) |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<[`CancelFunction`](../type-aliases/CancelFunction.md)\>

***

### isNamespaced

```ts
isNamespaced: boolean;
```

Defined in: [lib/k8s/api/v1/factories.ts:151](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L151)

***

### jsonPatch

```ts
jsonPatch: (body: OpPatch[], namespace: string, name: string, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

Defined in: [lib/k8s/api/v1/factories.ts:138](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L138)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `OpPatch`[] |
| `namespace` | `string` |
| `name` | `string` |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`ResourceType`\>

***

### list

```ts
list: (namespace: string, cb: StreamResultsCb<ResourceType>, errCb: StreamErrCb, queryParams?: QueryParameters, cluster?: string) => Promise<CancelFunction>;
```

Defined in: [lib/k8s/api/v1/factories.ts:105](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L105)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `namespace` | `string` |
| `cb` | [`StreamResultsCb`](../../streamingApi/type-aliases/StreamResultsCb.md)\<`ResourceType`\> |
| `errCb` | [`StreamErrCb`](../../streamingApi/type-aliases/StreamErrCb.md) |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<[`CancelFunction`](../type-aliases/CancelFunction.md)\>

***

### patch

```ts
patch: (body: OpPatch[], namespace: string, name: string, queryParams?: QueryParameters, cluster?: string) => Promise<any>;
```

Defined in: [lib/k8s/api/v1/factories.ts:131](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L131)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `OpPatch`[] |
| `namespace` | `string` |
| `name` | `string` |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`any`\>

***

### post

```ts
post: (body: RecursivePartial<KubeObjectInterface>, queryParams?: QueryParameters, cluster?: string) => Promise<any>;
```

Defined in: [lib/k8s/api/v1/factories.ts:120](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L120)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`RecursivePartial`](../type-aliases/RecursivePartial.md)\<[`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md)\> |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`any`\>

***

### put

```ts
put: (body: KubeObjectInterface, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

Defined in: [lib/k8s/api/v1/factories.ts:125](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L125)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`ResourceType`\>

***

### scale?

```ts
optional scale?: ScaleApi;
```

Defined in: [lib/k8s/api/v1/factories.ts:157](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L157)
