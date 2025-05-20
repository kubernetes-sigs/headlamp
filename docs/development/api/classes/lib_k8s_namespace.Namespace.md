[API](../API.md) / [lib/k8s/namespace](../modules/lib_k8s_namespace.md) / Namespace

# Class: Namespace

[lib/k8s/namespace](../modules/lib_k8s_namespace.md).Namespace

## Hierarchy

- `any`

  ↳ **`Namespace`**

## Constructors

### constructor

• **new Namespace**(`json`)

#### Parameters

| Name | Type |
| :------ | :------ |
| `json` | [`KubeNamespace`](../interfaces/lib_k8s_namespace.KubeNamespace.md) |

#### Inherited from

makeKubeObject<KubeNamespace\>('namespace').constructor

#### Defined in

[lib/k8s/cluster.ts:318](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L318)

## Properties

### apiEndpoint

▪ `Static` **apiEndpoint**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `apiInfo` | { `group`: `string` ; `resource`: `string` ; `version`: `string`  }[] |
| `delete` | (`name`: `string`, `queryParams?`: [`QueryParameters`](../interfaces/lib_k8s_apiProxy.QueryParameters.md), `cluster?`: `string`) => `Promise`<`any`\> |
| `get` | (`name`: `string`, `cb`: [`StreamResultsCb`](../modules/lib_k8s_apiProxy.md#streamresultscb), `errCb`: [`StreamErrCb`](../modules/lib_k8s_apiProxy.md#streamerrcb), `queryParams?`: [`QueryParameters`](../interfaces/lib_k8s_apiProxy.QueryParameters.md), `cluster?`: `string`) => `Promise`<() => `void`\> |
| `isNamespaced` | `boolean` |
| `list` | (`cb`: [`StreamResultsCb`](../modules/lib_k8s_apiProxy.md#streamresultscb), `errCb`: [`StreamErrCb`](../modules/lib_k8s_apiProxy.md#streamerrcb), `queryParams?`: [`QueryParameters`](../interfaces/lib_k8s_apiProxy.QueryParameters.md), `cluster?`: `string`) => `Promise`<() => `void`\> |
| `patch` | (`body`: `OpPatch`[], `name`: `string`, `queryParams?`: [`QueryParameters`](../interfaces/lib_k8s_apiProxy.QueryParameters.md), `cluster?`: `string`) => `Promise`<`any`\> |
| `post` | (`body`: `object` \| `JSON` \| [`KubeObjectInterface`](../interfaces/lib_k8s_cluster.KubeObjectInterface.md), `queryParams?`: [`QueryParameters`](../interfaces/lib_k8s_apiProxy.QueryParameters.md), `cluster?`: `string`) => `Promise`<`any`\> |
| `put` | (`body`: [`KubeObjectInterface`](../interfaces/lib_k8s_cluster.KubeObjectInterface.md), `queryParams?`: [`QueryParameters`](../interfaces/lib_k8s_apiProxy.QueryParameters.md), `cluster?`: `string`) => `Promise`<`any`\> |

#### Defined in

[lib/k8s/namespace.ts:11](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/namespace.ts#L11)

___

### className

▪ `Static` **className**: `string`

#### Inherited from

makeKubeObject<KubeNamespace\>('namespace').className

#### Defined in

[lib/k8s/cluster.ts:319](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L319)

## Accessors

### status

• `get` **status**(): `any`

#### Returns

`any`

#### Defined in

[lib/k8s/namespace.ts:13](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/namespace.ts#L13)

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

makeKubeObject<KubeNamespace\>('namespace').apiList

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

makeKubeObject<KubeNamespace\>('namespace').getAuthorization

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

makeKubeObject<KubeNamespace\>('namespace').getErrorMessage

#### Defined in

[lib/k8s/cluster.ts:317](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L317)

___

### isValidNamespaceFormat

▸ `Static` **isValidNamespaceFormat**(`namespace`): `boolean`

This function validates the custom namespace input matches the crieria for DNS-1123 label names.

**`params`** namespace: string

**`see`** https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names

#### Parameters

| Name | Type |
| :------ | :------ |
| `namespace` | `string` |

#### Returns

`boolean`

true if the namespace is valid, false otherwise.

#### Defined in

[lib/k8s/namespace.ts:23](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/namespace.ts#L23)

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

makeKubeObject<KubeNamespace\>('namespace').useApiGet

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

makeKubeObject<KubeNamespace\>('namespace').useApiList

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

makeKubeObject<KubeNamespace\>('namespace').useGet

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

makeKubeObject<KubeNamespace\>('namespace').useList

#### Defined in

[lib/k8s/cluster.ts:310](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L310)
