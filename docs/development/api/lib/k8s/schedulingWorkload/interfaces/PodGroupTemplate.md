# Interface: PodGroupTemplate

Defined in: [lib/k8s/schedulingWorkload.ts:35](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L35)

## Properties

### disruptionMode?

```ts
optional disruptionMode?: PodGroupDisruptionMode;
```

Defined in: [lib/k8s/schedulingWorkload.ts:41](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L41)

Whether a disruption affects one pod at a time, or the whole group.

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/schedulingWorkload.ts:36](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L36)

***

### preemptionPolicy?

```ts
optional preemptionPolicy?: "Never" | "PreemptLowerPriority";
```

Defined in: [lib/k8s/schedulingWorkload.ts:47](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L47)

Served by v1alpha3 and v1beta1. Whether preemption may evict lower priority pods.

***

### priority?

```ts
optional priority?: number;
```

Defined in: [lib/k8s/schedulingWorkload.ts:43](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L43)

***

### priorityClassName?

```ts
optional priorityClassName?: string;
```

Defined in: [lib/k8s/schedulingWorkload.ts:42](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L42)

***

### resourceClaims?

```ts
optional resourceClaims?: PodGroupResourceClaim[];
```

Defined in: [lib/k8s/schedulingWorkload.ts:39](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L39)

***

### schedulingConstraints?

```ts
optional schedulingConstraints?: PodGroupSchedulingConstraints;
```

Defined in: [lib/k8s/schedulingWorkload.ts:38](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L38)

***

### schedulingPolicy

```ts
schedulingPolicy: PodGroupSchedulingPolicy;
```

Defined in: [lib/k8s/schedulingWorkload.ts:37](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L37)
