# Interface: KubeListUpdateEvent\<T\>

Defined in: [lib/k8s/api/v2/KubeList.ts:29](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/KubeList.ts#L29)

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Properties

### object

```ts
object: T;
```

Defined in: [lib/k8s/api/v2/KubeList.ts:31](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/KubeList.ts#L31)

***

### type

```ts
type: "ADDED" | "MODIFIED" | "DELETED" | "ERROR";
```

Defined in: [lib/k8s/api/v2/KubeList.ts:30](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/KubeList.ts#L30)
