[API](../API.md) / [lib/k8s/ingress](../modules/lib_k8s_ingress.md) / Ingress

# Class: Ingress

[lib/k8s/ingress](../modules/lib_k8s_ingress.md).Ingress

## Hierarchy

- `any`

  ↳ **`Ingress`**

## Constructors

### constructor

• **new Ingress**(`json`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `json` | [`KubeIngress`](../interfaces/lib_k8s_ingress.KubeIngress.md) |

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').constructor

#### Defined in

[lib/k8s/cluster.ts:318](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L318)

## Properties

### apiEndpoint

▪ `Static` **apiEndpoint**: `Object`

#### Index signature

▪ [other: `string`]: `any`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `scale?` | { `get`: (`namespace`: `string`, `name`: `string`, `clusterName?`: `string`) => `Promise`<`any`\> ; `patch`: (`body`: { `spec`: { `replicas`: `number`  }  }, `metadata`: [`KubeMetadata`](../interfaces/lib_k8s_cluster.KubeMetadata.md), `clusterName?`: `string`) => `Promise`<`any`\> ; `put`: (`body`: { `metadata`: [`KubeMetadata`](../interfaces/lib_k8s_cluster.KubeMetadata.md) ; `spec`: { `replicas`: `number`  }  }, `clusterName?`: `string`) => `Promise`<`any`\>  } |
| `scale.get` | (`namespace`: `string`, `name`: `string`, `clusterName?`: `string`) => `Promise`<`any`\> |
| `scale.patch` | (`body`: { `spec`: { `replicas`: `number`  }  }, `metadata`: [`KubeMetadata`](../interfaces/lib_k8s_cluster.KubeMetadata.md), `clusterName?`: `string`) => `Promise`<`any`\> |
| `scale.put` | (`body`: { `metadata`: [`KubeMetadata`](../interfaces/lib_k8s_cluster.KubeMetadata.md) ; `spec`: { `replicas`: `number`  }  }, `clusterName?`: `string`) => `Promise`<`any`\> |

#### Defined in

[lib/k8s/ingress.ts:72](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/ingress.ts#L72)

___

### className

▪ `Static` **className**: `string`

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').className

#### Defined in

[lib/k8s/cluster.ts:319](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L319)

## Accessors

### spec

• `get` **spec**(): `Object`

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `defaultBackend?` | { `resource?`: { `apiVersion`: `string` ; `kind`: `string` ; `name`: `string`  } ; `service?`: { `name`: `string` ; `port`: { `name?`: `string` ; `number?`: `number`  }  }  } |
| `defaultBackend.resource?` | { `apiVersion`: `string` ; `kind`: `string` ; `name`: `string`  } |
| `defaultBackend.resource.apiVersion` | `string` |
| `defaultBackend.resource.kind` | `string` |
| `defaultBackend.resource.name` | `string` |
| `defaultBackend.service?` | { `name`: `string` ; `port`: { `name?`: `string` ; `number?`: `number`  }  } |
| `defaultBackend.service.name` | `string` |
| `defaultBackend.service.port` | { `name?`: `string` ; `number?`: `number`  } |
| `defaultBackend.service.port.name?` | `string` |
| `defaultBackend.service.port.number?` | `number` |
| `ingressClassName?` | `string` |
| `rules` | [`IngressRule`](../interfaces/lib_k8s_ingress.IngressRule.md)[] \| `LegacyIngressRule`[] |
| `tls?` | { `hosts`: `string`[] ; `secretName`: `string`  }[] |

#### Defined in

[lib/k8s/ingress.ts:79](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/ingress.ts#L79)

___

### listRoute

• `Static` `get` **listRoute**(): `string`

#### Returns

`string`

#### Defined in

[lib/k8s/ingress.ts:126](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/ingress.ts#L126)

___

### pluralName

• `Static` `get` **pluralName**(): `string`

#### Returns

`string`

#### Defined in

[lib/k8s/ingress.ts:130](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/ingress.ts#L130)

## Methods

### getHosts

▸ **getHosts**(): `string`

#### Returns

`string`

#### Defined in

[lib/k8s/ingress.ts:83](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/ingress.ts#L83)

___

### getRules

▸ **getRules**(): [`IngressRule`](../interfaces/lib_k8s_ingress.IngressRule.md)[]

#### Returns

[`IngressRule`](../interfaces/lib_k8s_ingress.IngressRule.md)[]

#### Defined in

[lib/k8s/ingress.ts:87](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/ingress.ts#L87)

___

### apiList

▸ `Static` **apiList**(`onList`, `onError?`, `opts?`): `any`

#### Parameters

| Name | Type |
| :------ | :------ |
| `onList` | (`arg`: `any`[]) => `void` |
| `onError?` | (`err`: [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md)) => `void` |
| `opts?` | [`ApiListSingleNamespaceOptions`](../interfaces/lib_k8s_cluster.ApiListSingleNamespaceOptions.md) |

#### Returns

`any`

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').apiList

#### Defined in

[lib/k8s/cluster.ts:294](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L294)

___

### getAuthorization

▸ `Static` `Optional` **getAuthorization**(`arg`, `resourceAttrs?`): `any`

#### Parameters

| Name | Type |
| :------ | :------ |
| `arg` | `string` |
| `resourceAttrs?` | [`AuthRequestResourceAttrs`](../interfaces/lib_k8s_cluster.AuthRequestResourceAttrs.md) |

#### Returns

`any`

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').getAuthorization

#### Defined in

[lib/k8s/cluster.ts:321](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L321)

___

### getErrorMessage

▸ `Static` **getErrorMessage**(`err?`): ``null`` \| `string`

#### Parameters

| Name | Type |
| :------ | :------ |
| `err?` | ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md) |

#### Returns

``null`` \| `string`

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').getErrorMessage

#### Defined in

[lib/k8s/cluster.ts:317](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L317)

___

### useApiGet

▸ `Static` **useApiGet**(`onGet`, `name`, `namespace?`, `onError?`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `onGet` | (...`args`: `any`) => `void` |
| `name` | `string` |
| `namespace?` | `string` |
| `onError?` | (`err`: [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md)) => `void` |

#### Returns

`void`

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').useApiGet

#### Defined in

[lib/k8s/cluster.ts:304](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L304)

___

### useApiList

▸ `Static` **useApiList**(`onList`, `onError?`, `opts?`): `any`

#### Parameters

| Name | Type |
| :------ | :------ |
| `onList` | (`arg`: `any`[]) => `void` |
| `onError?` | (`err`: [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md)) => `void` |
| `opts?` | [`ApiListOptions`](../interfaces/lib_k8s_cluster.ApiListOptions.md) |

#### Returns

`any`

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').useApiList

#### Defined in

[lib/k8s/cluster.ts:299](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L299)

___

### useGet

▸ `Static` **useGet**(`name`, `namespace?`): [`any`, ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md), (`item`: `any`) => `void`, (`err`: ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md)) => `void`]

#### Parameters

| Name | Type |
| :------ | :------ |
| `name` | `string` |
| `namespace?` | `string` |

#### Returns

[`any`, ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md), (`item`: `any`) => `void`, (`err`: ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md)) => `void`]

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').useGet

#### Defined in

[lib/k8s/cluster.ts:313](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L313)

___

### useList

▸ `Static` **useList**(`opts?`): [`any`[], ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md), (`items`: `any`[]) => `void`, (`err`: ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md)) => `void`]

#### Parameters

| Name | Type |
| :------ | :------ |
| `opts?` | [`ApiListOptions`](../interfaces/lib_k8s_cluster.ApiListOptions.md) |

#### Returns

[`any`[], ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md), (`items`: `any`[]) => `void`, (`err`: ``null`` \| [`ApiError`](../interfaces/lib_k8s_apiProxy.ApiError.md)) => `void`]

#### Inherited from

makeKubeObject<KubeIngress\>('ingress').useList

#### Defined in

[lib/k8s/cluster.ts:310](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L310)
