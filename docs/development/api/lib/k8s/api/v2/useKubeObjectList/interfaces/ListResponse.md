# Interface: ListResponse\<K\>

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:46](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L46)

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

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:50](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L50)

Cluster of the list

***

### list

```ts
list: KubeList<K>;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:48](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L48)

KubeList with items

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:52](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L52)

If the list only has items from one namespace
