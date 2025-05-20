[API](../API.md) / [lib/util](lib_util.md) / auth

# Namespace: auth

[lib/util](lib_util.md).auth

## Functions

### deleteTokens

▸ **deleteTokens**(): `void`

#### Returns

`void`

#### Defined in

[lib/auth.ts:41](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/auth.ts#L41)

___

### getToken

▸ **getToken**(`cluster`): `any`

#### Parameters

| Name | Type |
| :------ | :------ |
| `cluster` | `string` |

#### Returns

`any`

#### Defined in

[lib/auth.ts:7](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/auth.ts#L7)

___

### getUserInfo

▸ **getUserInfo**(`cluster`): `any`

#### Parameters

| Name | Type |
| :------ | :------ |
| `cluster` | `string` |

#### Returns

`any`

#### Defined in

[lib/auth.ts:17](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/auth.ts#L17)

___

### hasToken

▸ **hasToken**(`cluster`): `boolean`

#### Parameters

| Name | Type |
| :------ | :------ |
| `cluster` | `string` |

#### Returns

`boolean`

#### Defined in

[lib/auth.ts:22](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/auth.ts#L22)

___

### logout

▸ **logout**(): `void`

#### Returns

`void`

#### Defined in

[lib/auth.ts:45](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/auth.ts#L45)

___

### setToken

▸ **setToken**(`cluster`, `token`): `void`

#### Parameters

| Name | Type |
| :------ | :------ |
| `cluster` | `string` |
| `token` | ``null`` \| `string` |

#### Returns

`void`

#### Defined in

[lib/auth.ts:30](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/auth.ts#L30)
