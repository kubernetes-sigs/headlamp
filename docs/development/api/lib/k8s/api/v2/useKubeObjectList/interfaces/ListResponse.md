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

[src/lib/k8s/api/v2/useKubeObjectList.ts:49](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L49)

***

### list

```ts
list: KubeList<K>;
```

KubeList with items

#### Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:47](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L47)

***

### namespace?

```ts
optional namespace: string;
```

If the list only has items from one namespace

#### Defined in

[src/lib/k8s/api/v2/useKubeObjectList.ts:51](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L51)
