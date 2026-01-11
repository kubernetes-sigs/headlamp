# Interface: ApiClient\<ResourceType\>

## Type Parameters

| Type Parameter |
| ------ |
| `ResourceType` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Properties

### apiInfo

```ts
apiInfo: object[];
```

#### Defined in

[src/lib/k8s/api/v1/factories.ts:89](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L89)

***

### delete()

```ts
delete: (name: string, deleteParams?: DeleteParameters, cluster?: string) => Promise<any>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `deleteParams`? | [`DeleteParameters`](../../deleteParameters/interfaces/DeleteParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:87](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L87)

***

### get()

```ts
get: (name: string, cb: StreamResultsCb<ResourceType>, errCb: StreamErrCb, queryParams?: QueryParameters, cluster?: string) => Promise<CancelFunction>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `cb` | [`StreamResultsCb`](../../streamingApi/type-aliases/StreamResultsCb.md)\<`ResourceType`\> |
| `errCb` | [`StreamErrCb`](../../streamingApi/type-aliases/StreamErrCb.md) |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<[`CancelFunction`](../type-aliases/CancelFunction.md)\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:64](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L64)

***

### isNamespaced

```ts
isNamespaced: boolean;
```

#### Defined in

[src/lib/k8s/api/v1/factories.ts:88](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L88)

***

### list()

```ts
list: (cb: StreamResultsCb<ResourceType>, errCb: StreamErrCb, queryParams?: QueryParameters, cluster?: string) => Promise<CancelFunction>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `cb` | [`StreamResultsCb`](../../streamingApi/type-aliases/StreamResultsCb.md)\<`ResourceType`\> |
| `errCb` | [`StreamErrCb`](../../streamingApi/type-aliases/StreamErrCb.md) |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<[`CancelFunction`](../type-aliases/CancelFunction.md)\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:58](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L58)

***

### patch()

```ts
patch: (body: OpPatch[], name: string, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `OpPatch`[] |
| `name` | `string` |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`ResourceType`\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:81](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L81)

***

### post()

```ts
post: (body: RecursivePartial<ResourceType>, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`RecursivePartial`](../type-aliases/RecursivePartial.md)\<`ResourceType`\> |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`ResourceType`\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:71](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L71)

***

### put()

```ts
put: (body: ResourceType, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `ResourceType` |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`ResourceType`\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:76](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L76)
