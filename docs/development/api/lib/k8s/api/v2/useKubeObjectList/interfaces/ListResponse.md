# Interface: ListResponse\<K\>

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

Cluster of the list

#### Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:49](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L49)

***

### list

```ts
list: KubeList<K>;
```

KubeList with items

#### Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:47](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L47)

***

### namespace?

```ts
optional namespace: string;
```

If the list only has items from one namespace

#### Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:51](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L51)
