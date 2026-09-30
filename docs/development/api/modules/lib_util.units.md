[API](../API.md) / [lib/util](lib_util.md) / units

# Namespace: units

[lib/util](lib_util.md).units

## Interfaces

- [QuantityParts](../interfaces/lib_util.units.QuantityParts.md)

## Variables

### TO\_GB

• **TO\_GB**: `number`

#### Defined in

[lib/units.ts:10](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/units.ts#L10)

___

### TO\_ONE\_CPU

• **TO\_ONE\_CPU**: ``1000000000``

#### Defined in

[lib/units.ts:12](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/units.ts#L12)

___

### TO\_ONE\_M\_CPU

• **TO\_ONE\_M\_CPU**: ``1000000``

#### Defined in

[lib/units.ts:11](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/units.ts#L11)

## Functions

### parseCpu

▸ **parseCpu**(`value`): `number`

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `string` |

#### Returns

`number`

#### Defined in

[lib/units.ts:62](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/units.ts#L62)

___

### parseDiskSpace

▸ **parseDiskSpace**(`value`): `number`

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `string` |

#### Returns

`number`

#### Defined in

[lib/units.ts:14](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/units.ts#L14)

___

### parseQuantity

▸ **parseQuantity**(`quantity`): `undefined` \| `number`

Reads a Kubernetes quantity as a plain number, e.g. the bytes of a storage size.

It reads the quantity the way splitQuantity does, so that sizes compared with it agree
with the parts a user edits.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `quantity` | `string` | The quantity to read, e.g. '8Gi', '100k' or '1e9'. |

#### Returns

`undefined` \| `number`

The number, or undefined when the quantity cannot be read.

#### Defined in

[lib/units.ts:200](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/units.ts#L200)

___

### parseRam

▸ **parseRam**(`value`): `number`

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `string` |

#### Returns

`number`

#### Defined in

[lib/units.ts:18](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/units.ts#L18)

___

### splitQuantity

▸ **splitQuantity**(`quantity`): `undefined` \| [`QuantityParts`](../interfaces/lib_util.units.QuantityParts.md)

Splits a Kubernetes quantity into its number and its suffix.

Quantities are written as a number followed by an optional suffix, e.g. '8Gi'. Editing
one means editing the number while keeping the suffix the cluster reported. A decimal
exponent, e.g. '1e9', has no suffix to keep, so it is folded into the decimal suffix it
stands for, or into the number when there is none.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `quantity` | `string` | The quantity to split, e.g. '8Gi'. |

#### Returns

`undefined` \| [`QuantityParts`](../interfaces/lib_util.units.QuantityParts.md)

The number and the suffix, or undefined when the quantity cannot be read.

#### Defined in

[lib/units.ts:170](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/units.ts#L170)

___

### unparseCpu

▸ **unparseCpu**(`value`): `Object`

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `string` |

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `unit` | `string` |
| `value` | `number` |

#### Defined in

[lib/units.ts:72](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/units.ts#L72)

___

### unparseRam

▸ **unparseRam**(`value`): `Object`

#### Parameters

| Name | Type |
| :------ | :------ |
| `value` | `number` |

#### Returns

`Object`

| Name | Type |
| :------ | :------ |
| `unit` | `string` |
| `value` | `number` |

#### Defined in

[lib/units.ts:49](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/units.ts#L49)
