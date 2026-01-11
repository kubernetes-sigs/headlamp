# Function: ~~makeKubeObject()~~

```ts
function makeKubeObject<T>(): typeof KubeObjectInternal
```

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../interfaces/KubeObjectInterface.md) \| [`KubeEvent`](../../event/interfaces/KubeEvent.md) |

## Returns

*typeof* `KubeObjectInternal`

A KubeObject implementation for the given object name.

## Deprecated

This function is no longer recommended, it's kept for backwards compatibility.
Please extend KubeObject instead

## Defined in

[src/lib/k8s/KubeObject.ts:697](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L697)
