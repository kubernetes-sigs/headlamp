# Interface: ListResponse\<K\>

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:59](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L59)

Object representing a List of Kube object
with information about which cluster and namespace it came from

## Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* [`KubeObject`](../../../../KubeObject/classes/KubeObject.md) |

## Properties

### cluster

```ts
cluster: string;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:63](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L63)

Cluster of the list

***

### list

```ts
list: KubeList<K>;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:61](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L61)

KubeList with items

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:65](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L65)

If the list only has items from one namespace
