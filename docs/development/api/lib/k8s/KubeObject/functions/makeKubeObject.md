# ~~Function: makeKubeObject()~~

```ts
function makeKubeObject<T>(): typeof KubeObjectInternal;
```

Defined in: [lib/k8s/KubeObject.ts:715](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L715)

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
