# Interface: KubeListUpdateEvent\<T\>

Defined in: [lib/k8s/api/v2/KubeList.ts:33](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v2/KubeList.ts#L33)

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Properties

### object

```ts
object: T;
```

Defined in: [lib/k8s/api/v2/KubeList.ts:35](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v2/KubeList.ts#L35)

***

### type

```ts
type: "ADDED" | "MODIFIED" | "DELETED" | "ERROR";
```

Defined in: [lib/k8s/api/v2/KubeList.ts:34](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v2/KubeList.ts#L34)
