# Interface: ApiClient\<ResourceType\>

Defined in: [lib/k8s/api/v1/factories.ts:57](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L57)

## Type Parameters

| Type Parameter |
| ------ |
| `ResourceType` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Properties

### apiInfo

```ts
apiInfo: object[];
```

Defined in: [lib/k8s/api/v1/factories.ts:97](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L97)

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
delete: (name: string, deleteParams?: DeleteParameters, cluster?: string) => Promise<any>;
```

Defined in: [lib/k8s/api/v1/factories.ts:95](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L95)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `deleteParams?` | [`DeleteParameters`](../../deleteParameters/interfaces/DeleteParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`any`\>

***

### get

```ts
get: (name: string, cb: StreamResultsCb<ResourceType>, errCb: StreamErrCb, queryParams?: QueryParameters, cluster?: string) => Promise<CancelFunction>;
```

Defined in: [lib/k8s/api/v1/factories.ts:64](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L64)

#### Parameters

| Parameter | Type |
| ------ | ------ |
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

Defined in: [lib/k8s/api/v1/factories.ts:96](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L96)

***

### jsonPatch

```ts
jsonPatch: (body: OpPatch[], name: string, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

Defined in: [lib/k8s/api/v1/factories.ts:89](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L89)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `OpPatch`[] |
| `name` | `string` |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`ResourceType`\>

***

### list

```ts
list: (cb: StreamResultsCb<ResourceType>, errCb: StreamErrCb, queryParams?: QueryParameters, cluster?: string) => Promise<CancelFunction>;
```

Defined in: [lib/k8s/api/v1/factories.ts:58](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L58)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `cb` | [`StreamResultsCb`](../../streamingApi/type-aliases/StreamResultsCb.md)\<`ResourceType`\> |
| `errCb` | [`StreamErrCb`](../../streamingApi/type-aliases/StreamErrCb.md) |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<[`CancelFunction`](../type-aliases/CancelFunction.md)\>

***

### patch

```ts
patch: (body: OpPatch[], name: string, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

Defined in: [lib/k8s/api/v1/factories.ts:83](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L83)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `OpPatch`[] |
| `name` | `string` |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`ResourceType`\>

***

### post

```ts
post: (body: RecursivePartial<ResourceType>, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

Defined in: [lib/k8s/api/v1/factories.ts:71](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L71)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`RecursivePartial`](../type-aliases/RecursivePartial.md)\<`ResourceType`\> |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`ResourceType`\>

***

### put

```ts
put: (body: ResourceType, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

Defined in: [lib/k8s/api/v1/factories.ts:76](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v1/factories.ts#L76)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `ResourceType` |
| `queryParams?` | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster?` | `string` |

#### Returns

`Promise`\<`ResourceType`\>
