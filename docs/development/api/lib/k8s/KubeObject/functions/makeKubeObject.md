# ~~Function: makeKubeObject()~~

```ts
function makeKubeObject<T>(): typeof KubeObjectInternal;
```

Defined in: [lib/k8s/KubeObject.ts:764](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L764)

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
