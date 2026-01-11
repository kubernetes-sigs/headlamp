# Interface: KubeListUpdateEvent\<T\>

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Properties

### object

```ts
object: T;
```

#### Defined in

[src/lib/k8s/api/v2/KubeList.ts:31](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/KubeList.ts#L31)

***

### type

```ts
type: "ADDED" | "MODIFIED" | "DELETED" | "ERROR";
```

#### Defined in

[src/lib/k8s/api/v2/KubeList.ts:30](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/KubeList.ts#L30)
