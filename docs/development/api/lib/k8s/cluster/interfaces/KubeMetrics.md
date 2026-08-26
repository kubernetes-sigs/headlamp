# Interface: KubeMetrics

Defined in: [lib/k8s/cluster.ts:538](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L538)

## Properties

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/cluster.ts:539](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L539)

***

### status

```ts
status: object;
```

Defined in: [lib/k8s/cluster.ts:544](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L544)

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

Defined in: [lib/k8s/cluster.ts:540](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L540)

#### cpu

```ts
cpu: string;
```

#### memory

```ts
memory: string;
```
