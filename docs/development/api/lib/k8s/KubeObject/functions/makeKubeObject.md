# ~~Function: makeKubeObject()~~

```ts
function makeKubeObject<T>(): typeof KubeObjectInternal;
```

Defined in: [lib/k8s/KubeObject.ts:763](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L763)

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* \| [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../event/interfaces/KubeEvent.md) |

## Returns

*typeof* `KubeObjectInternal`

A KubeObject implementation for the given object name.

## Deprecated

This function is no longer recommended, it's kept for backwards compatibility.
Please extend KubeObject instead
