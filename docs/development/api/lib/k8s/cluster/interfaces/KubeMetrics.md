# Interface: KubeMetrics

Defined in: [lib/k8s/cluster.ts:529](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L529)

## Properties

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/cluster.ts:530](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L530)

***

### status

```ts
status: object;
```

Defined in: [lib/k8s/cluster.ts:535](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L535)

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

Defined in: [lib/k8s/cluster.ts:531](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L531)

#### cpu

```ts
cpu: string;
```

#### memory

```ts
memory: string;
```
