[API](../API.md) / [lib/k8s/persistentVolumeClaim](../modules/lib_k8s_persistentVolumeClaim.md) / PersistentVolumeClaim

# Class: PersistentVolumeClaim

[lib/k8s/persistentVolumeClaim](../modules/lib_k8s_persistentVolumeClaim.md).PersistentVolumeClaim

## Hierarchy

- `any`

  ↳ **`PersistentVolumeClaim`**

## Constructors

### constructor

• **new PersistentVolumeClaim**(`json`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `json` | [`KubePersistentVolumeClaim`](../interfaces/lib_k8s_persistentVolumeClaim.KubePersistentVolumeClaim.md) |

#### Inherited from

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).constructor

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

[lib/k8s/persistentVolumeClaim.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/persistentVolumeClaim.ts#L32)

___

### className

▪ `Static` **className**: `string`

#### Inherited from

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).className

#### Defined in

[lib/k8s/cluster.ts:319](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L319)

## Accessors

### requestedStorage

• `get` **requestedStorage**(): `undefined` \| `string`

The size asked for in the spec, which the provider grows the volume towards.

#### Returns

`undefined` \| `string`

#### Defined in

[lib/k8s/persistentVolumeClaim.ts:87](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/k8s/persistentVolumeClaim.ts#L87)

___

### resizeCondition

• `get` **resizeCondition**(): `undefined` \| [`KubeCondition`](../interfaces/lib_k8s_cluster.KubeCondition.md)

Whether the volume, or the file system on it, is still growing towards the request.

#### Returns

`undefined` \| [`KubeCondition`](../interfaces/lib_k8s_cluster.KubeCondition.md)

#### Defined in

[lib/k8s/persistentVolumeClaim.ts:92](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/k8s/persistentVolumeClaim.ts#L92)

___

### spec

• `get` **spec**(): `any`

#### Returns

`any`

#### Defined in

[lib/k8s/persistentVolumeClaim.ts:34](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/persistentVolumeClaim.ts#L34)

___

### status

• `get` **status**(): `any`

#### Returns

`any`

#### Defined in

[lib/k8s/persistentVolumeClaim.ts:38](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/persistentVolumeClaim.ts#L38)

## Methods

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

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).apiList

#### Defined in

[lib/k8s/cluster.ts:294](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L294)

___

### expandTo

▸ **expandTo**(`storage`): `Promise`<`any`\>

Asks the storage provider for a larger volume.

Only claims bound to a storage class that allows expansion can grow, and the API
rejects a request that is smaller than the current one, because a volume cannot
shrink.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `storage` | `string` | The new size, as a Kubernetes quantity such as '20Gi'. |

#### Returns

`Promise`<`any`\>

The patched claim.

#### Defined in

[lib/k8s/persistentVolumeClaim.ts:107](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/k8s/persistentVolumeClaim.ts#L107)

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

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).getAuthorization

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

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).getErrorMessage

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

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).useApiGet

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

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).useApiList

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

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).useGet

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

makeKubeObject<KubePersistentVolumeClaim\>(
  'persistentVolumeClaim'
).useList

#### Defined in

[lib/k8s/cluster.ts:310](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L310)
