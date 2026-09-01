# Interface: CompositePodGroupTemplate

Defined in: [lib/k8s/schedulingWorkload.ts:66](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L66)

A group of pod group templates scheduled together. Served by v1alpha3 and v1beta1,
and may nest further composite templates.

## Properties

### compositePodGroupTemplates?

```ts
optional compositePodGroupTemplates?: CompositePodGroupTemplate[];
```

Defined in: [lib/k8s/schedulingWorkload.ts:76](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L76)

***

### disruptionMode?

```ts
optional disruptionMode?: PodGroupDisruptionMode;
```

Defined in: [lib/k8s/schedulingWorkload.ts:71](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L71)

Whether a disruption affects one child group at a time, or the whole composite.

***

### name

```ts
name: string;
```

Defined in: [lib/k8s/schedulingWorkload.ts:67](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L67)

***

### podGroupTemplates?

```ts
optional podGroupTemplates?: PodGroupTemplate[];
```

Defined in: [lib/k8s/schedulingWorkload.ts:75](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L75)

***

### preemptionPolicy?

```ts
optional preemptionPolicy?: "Never" | "PreemptLowerPriority";
```

Defined in: [lib/k8s/schedulingWorkload.ts:74](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L74)

***

### priority?

```ts
optional priority?: number;
```

Defined in: [lib/k8s/schedulingWorkload.ts:73](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L73)

***

### priorityClassName?

```ts
optional priorityClassName?: string;
```

Defined in: [lib/k8s/schedulingWorkload.ts:72](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L72)

***

### schedulingConstraints?

```ts
optional schedulingConstraints?: PodGroupSchedulingConstraints;
```

Defined in: [lib/k8s/schedulingWorkload.ts:69](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L69)

***

### schedulingPolicy

```ts
schedulingPolicy: CompositePodGroupSchedulingPolicy;
```

Defined in: [lib/k8s/schedulingWorkload.ts:68](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L68)
