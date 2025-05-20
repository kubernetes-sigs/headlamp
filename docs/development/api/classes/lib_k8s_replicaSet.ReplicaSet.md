[API](../API.md) / [lib/k8s/replicaSet](../modules/lib_k8s_replicaSet.md) / ReplicaSet

# Class: ReplicaSet

[lib/k8s/replicaSet](../modules/lib_k8s_replicaSet.md).ReplicaSet

## Hierarchy

- `any`

  ↳ **`ReplicaSet`**

## Constructors

### constructor

• **new ReplicaSet**(`json`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `json` | [`KubeReplicaSet`](../interfaces/lib_k8s_replicaSet.KubeReplicaSet.md) |

#### Inherited from

makeKubeObject<KubeReplicaSet\>('ReplicaSet').constructor

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

[lib/k8s/replicaSet.ts:34](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/replicaSet.ts#L34)

___

### className

▪ `Static` **className**: `string`

#### Inherited from

makeKubeObject<KubeReplicaSet\>('ReplicaSet').className

#### Defined in

[lib/k8s/cluster.ts:319](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L319)

## Accessors

### spec

• `get` **spec**(): `Object`

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `minReadySeconds` | `number` |
| `replicas` | `number` |
| `selector` | [`LabelSelector`](../interfaces/lib_k8s_cluster.LabelSelector.md) |
| `template` | { `metadata?`: [`KubeMetadata`](../interfaces/lib_k8s_cluster.KubeMetadata.md) ; `spec`: [`KubePodSpec`](../interfaces/lib_k8s_pod.KubePodSpec.md)  } |
| `template.metadata?` | [`KubeMetadata`](../interfaces/lib_k8s_cluster.KubeMetadata.md) |
| `template.spec` | [`KubePodSpec`](../interfaces/lib_k8s_pod.KubePodSpec.md) |

#### Defined in

[lib/k8s/replicaSet.ts:36](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/replicaSet.ts#L36)

___

### status

• `get` **status**(): `Object`

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `availableReplicas` | `number` |
| `conditions` | `Omit`<[`KubeCondition`](../interfaces/lib_k8s_cluster.KubeCondition.md), ``"lastProbeTime"`` \| ``"lastUpdateTime"``\>[] |
| `fullyLabeledReplicas` | `number` |
| `observedGeneration` | `number` |
| `readyReplicas` | `number` |
| `replicas` | `number` |

#### Defined in

[lib/k8s/replicaSet.ts:40](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/replicaSet.ts#L40)

## Methods

### getContainers

▸ **getContainers**(): [`KubeContainer`](../interfaces/lib_k8s_cluster.KubeContainer.md)[]

#### Returns

[`KubeContainer`](../interfaces/lib_k8s_cluster.KubeContainer.md)[]

#### Defined in

[lib/k8s/replicaSet.ts:44](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/replicaSet.ts#L44)

___

### getMatchLabelsList

▸ **getMatchLabelsList**(): `string`[]

#### Returns

`string`[]

#### Defined in

[lib/k8s/replicaSet.ts:48](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/replicaSet.ts#L48)

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

makeKubeObject<KubeReplicaSet\>('ReplicaSet').apiList

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

makeKubeObject<KubeReplicaSet\>('ReplicaSet').getAuthorization

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

makeKubeObject<KubeReplicaSet\>('ReplicaSet').getErrorMessage

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

makeKubeObject<KubeReplicaSet\>('ReplicaSet').useApiGet

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

makeKubeObject<KubeReplicaSet\>('ReplicaSet').useApiList

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

makeKubeObject<KubeReplicaSet\>('ReplicaSet').useGet

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

makeKubeObject<KubeReplicaSet\>('ReplicaSet').useList

#### Defined in

[lib/k8s/cluster.ts:310](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L310)
