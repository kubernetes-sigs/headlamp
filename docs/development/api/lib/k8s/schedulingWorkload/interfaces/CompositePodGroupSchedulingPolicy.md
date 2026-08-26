# Interface: CompositePodGroupSchedulingPolicy

Defined in: [lib/k8s/schedulingWorkload.ts:55](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L55)

How the child groups of a composite template are scheduled. Mirrors
PodGroupSchedulingPolicy, except that the gang policy counts child groups rather
than pods.

## Properties

### basic?

```ts
optional basic?: Record<string, never>;
```

Defined in: [lib/k8s/schedulingWorkload.ts:56](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L56)

***

### gang?

```ts
optional gang?: object;
```

Defined in: [lib/k8s/schedulingWorkload.ts:57](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L57)

#### minGroupCount

```ts
minGroupCount: number;
```
