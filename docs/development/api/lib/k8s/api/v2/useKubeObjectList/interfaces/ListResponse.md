# Interface: ListResponse\<K\>

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:60](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L60)

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

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:64](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L64)

Cluster of the list

***

### list

```ts
list: KubeList<K>;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:62](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L62)

KubeList with items

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:66](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L66)

If the list only has items from one namespace

***

### skipWatch?

```ts
optional skipWatch?: boolean;
```

Defined in: [lib/k8s/api/v2/useKubeObjectList.ts:68](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/api/v2/useKubeObjectList.ts#L68)

Whether this synthesized list must not start a cluster-wide watch
