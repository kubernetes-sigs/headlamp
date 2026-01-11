# Interface: ApiWithNamespaceClient\<ResourceType\>

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

[src/lib/k8s/api/v1/factories.ts:136](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L136)

***

### delete()

```ts
delete: (namespace: string, name: string, deleteParams?: DeleteParameters, cluster?: string) => Promise<any>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `namespace` | `string` |
| `name` | `string` |
| `deleteParams`? | [`DeleteParameters`](../../deleteParameters/interfaces/DeleteParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:129](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L129)

***

### get()

```ts
get: (namespace: string, name: string, cb: StreamResultsCb<ResourceType>, errCb: StreamErrCb, queryParams?: QueryParameters, cluster?: string) => Promise<CancelFunction>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `namespace` | `string` |
| `name` | `string` |
| `cb` | [`StreamResultsCb`](../../streamingApi/type-aliases/StreamResultsCb.md)\<`ResourceType`\> |
| `errCb` | [`StreamErrCb`](../../streamingApi/type-aliases/StreamErrCb.md) |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<[`CancelFunction`](../type-aliases/CancelFunction.md)\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:104](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L104)

***

### isNamespaced

```ts
isNamespaced: boolean;
```

#### Defined in

[src/lib/k8s/api/v1/factories.ts:135](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L135)

***

### list()

```ts
list: (namespace: string, cb: StreamResultsCb<ResourceType>, errCb: StreamErrCb, queryParams?: QueryParameters, cluster?: string) => Promise<CancelFunction>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `namespace` | `string` |
| `cb` | [`StreamResultsCb`](../../streamingApi/type-aliases/StreamResultsCb.md)\<`ResourceType`\> |
| `errCb` | [`StreamErrCb`](../../streamingApi/type-aliases/StreamErrCb.md) |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<[`CancelFunction`](../type-aliases/CancelFunction.md)\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:97](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L97)

***

### patch()

```ts
patch: (body: OpPatch[], namespace: string, name: string, queryParams?: QueryParameters, cluster?: string) => Promise<any>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `OpPatch`[] |
| `namespace` | `string` |
| `name` | `string` |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:122](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L122)

***

### post()

```ts
post: (body: RecursivePartial<KubeObjectInterface>, queryParams?: QueryParameters, cluster?: string) => Promise<any>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`RecursivePartial`](../type-aliases/RecursivePartial.md)\<[`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md)\> |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:112](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L112)

***

### put()

```ts
put: (body: KubeObjectInterface, queryParams?: QueryParameters, cluster?: string) => Promise<ResourceType>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |
| `queryParams`? | [`QueryParameters`](../../queryParameters/interfaces/QueryParameters.md) |
| `cluster`? | `string` |

#### Returns

`Promise`\<`ResourceType`\>

#### Defined in

[src/lib/k8s/api/v1/factories.ts:117](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L117)

***

### scale?

```ts
optional scale: ScaleApi;
```

#### Defined in

[src/lib/k8s/api/v1/factories.ts:141](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/factories.ts#L141)
