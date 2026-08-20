# Function: validateCRDSpec()

```ts
function validateCRDSpec(spec: CRDSpecLike | undefined): CRDValidation;
```

Defined in: [lib/k8s/crdSpec.ts:93](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/crdSpec.ts#L93)

Validates a CRD spec and returns the list of missing required fields plus
the subset of version entries that are usable (named and served).

Treats the older v1beta1 single-version shape (`spec.version` set without
`spec.versions[]`) as usable. `names.singular` is intentionally not
required because Kubernetes treats it as optional and the server defaults
it from `kind`. `group` and `scope` are required because empty values
would route requests to the wrong endpoint.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `spec` | [`CRDSpecLike`](../interfaces/CRDSpecLike.md) \| `undefined` |

## Returns

[`CRDValidation`](../type-aliases/CRDValidation.md)
