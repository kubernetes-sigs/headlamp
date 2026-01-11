# Interface: ScaleApi

## Properties

### get()

```ts
get: (namespace: string, name: string, clusterName?: string) => Promise<any>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `namespace` | `string` |
| `name` | `string` |
| `clusterName`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/api/v1/scaleApi.ts:22](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/scaleApi.ts#L22)

***

### patch()

```ts
patch: (body: object, metadata: KubeMetadata, clusterName?: string) => Promise<any>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `object` |
| `body.spec` | `object` |
| `body.spec.replicas` | `number` |
| `metadata`? | [`KubeMetadata`](../../../../KubeMetadata/interfaces/KubeMetadata.md) |
| `clusterName`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/api/v1/scaleApi.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/scaleApi.ts#L32)

***

### put()

```ts
put: (body: object, clusterName?: string) => Promise<any>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `object` |
| `body.metadata` | [`KubeMetadata`](../../../../KubeMetadata/interfaces/KubeMetadata.md) |
| `body.spec`? | `object` |
| `body.spec.replicas`? | `number` |
| `clusterName`? | `string` |

#### Returns

`Promise`\<`any`\>

#### Defined in

[src/lib/k8s/api/v1/scaleApi.ts:23](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v1/scaleApi.ts#L23)
