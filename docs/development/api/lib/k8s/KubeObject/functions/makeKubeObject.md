# ~~Function: makeKubeObject()~~

```ts
function makeKubeObject<T>(): typeof KubeObjectInternal;
```

Defined in: [lib/k8s/KubeObject.ts:766](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L766)

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
