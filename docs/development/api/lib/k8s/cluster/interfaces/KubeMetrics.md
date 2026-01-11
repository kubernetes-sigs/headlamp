# Interface: KubeMetrics

## Properties

### metadata

```ts
metadata: KubeMetadata;
```

#### Defined in

[src/lib/k8s/cluster.ts:530](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L530)

***

### status

```ts
status: object;
```

#### capacity

```ts
capacity: object;
```

#### capacity.cpu

```ts
cpu: string;
```

#### capacity.memory

```ts
memory: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:535](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L535)

***

### usage

```ts
usage: object;
```

#### cpu

```ts
cpu: string;
```

#### memory

```ts
memory: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:531](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L531)
