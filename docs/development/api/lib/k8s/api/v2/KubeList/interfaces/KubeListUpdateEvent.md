# Interface: KubeListUpdateEvent\<T\>

Defined in: [lib/k8s/api/v2/KubeList.ts:33](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/KubeList.ts#L33)

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`KubeObjectInterface`](../../../../KubeObject/interfaces/KubeObjectInterface.md) |

## Properties

### object

```ts
object: T;
```

Defined in: [lib/k8s/api/v2/KubeList.ts:35](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/KubeList.ts#L35)

***

### type

```ts
type: "ADDED" | "MODIFIED" | "DELETED" | "ERROR";
```

Defined in: [lib/k8s/api/v2/KubeList.ts:34](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/KubeList.ts#L34)
