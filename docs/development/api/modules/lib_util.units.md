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

### compareQuantities

▸ **compareQuantities**(`a`, `b`): `undefined` \| `number`

Compares two Kubernetes quantities exactly, whatever their size and suffix.

It reads the quantities the way splitQuantity does, so that it agrees with the parts a
user edits.

#### Parameters

| Name | Type | Description |
| :------ | :------ | :------ |
| `a` | `string` | The first quantity, e.g. '8Gi', '100k' or '1e9'. |
| `b` | `string` | The second quantity. |

#### Returns

`undefined` \| `number`

A negative number, 0 or a positive number when a is smaller than, equal to or
larger than b, or undefined when either cannot be read.

#### Defined in

[lib/units.ts:223](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/units.ts#L223)

___

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

[lib/units.ts:190](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/units.ts#L190)

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
