# Interface: KubeMetrics

Defined in: [lib/k8s/cluster.ts:529](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/cluster.ts#L529)

## Properties

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/cluster.ts:530](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/cluster.ts#L530)

***

### status

```ts
status: object;
```

Defined in: [lib/k8s/cluster.ts:535](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/cluster.ts#L535)

#### capacity

```ts
capacity: object;
```

##### capacity.cpu

```ts
cpu: string;
```

##### capacity.memory

```ts
memory: string;
```

***

### usage

```ts
usage: object;
```

Defined in: [lib/k8s/cluster.ts:531](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/cluster.ts#L531)

#### cpu

```ts
cpu: string;
```

#### memory

```ts
memory: string;
```
