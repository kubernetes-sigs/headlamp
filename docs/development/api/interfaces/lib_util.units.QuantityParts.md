[API](../API.md) / [lib/util](../modules/lib_util.md) / [units](../modules/lib_util.units.md) / QuantityParts

# Interface: QuantityParts

[lib/util](../modules/lib_util.md).[units](../modules/lib_util.units.md).QuantityParts

A Kubernetes quantity split into the number the user edits and its suffix.

## Properties

### unit

• **unit**: `string`

The suffix as written, e.g. 'Gi' or 'M'. Empty when the quantity has no suffix.

#### Defined in

[lib/units.ts:128](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/units.ts#L128)

___

### value

• **value**: `number`

#### Defined in

[lib/units.ts:126](https://github.com/kubernetes-sigs/headlamp/blob/main/frontend/src/lib/units.ts#L126)
