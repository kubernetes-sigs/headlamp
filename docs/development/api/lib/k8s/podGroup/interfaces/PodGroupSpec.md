# Interface: PodGroupSpec

Defined in: [lib/k8s/podGroup.ts:76](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L76)

## Properties

### disruptionMode?

```ts
optional disruptionMode?: 
  | "PodGroup"
  | "Pod"
  | PodGroupDisruptionMode;
```

Defined in: [lib/k8s/podGroup.ts:99](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L99)

v1alpha2 serves this as the string 'Pod' or 'PodGroup'; v1alpha3 and v1beta1 serve
it as an object with a `single` or `all` field. Read it through the
`disruptionMode` getter.

***

### parentCompositePodGroupName?

```ts
optional parentCompositePodGroupName?: string;
```

Defined in: [lib/k8s/podGroup.ts:86](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L86)

The composite group this group belongs to, when nested. Served by v1alpha3 and
v1beta1.

***

### podGroupTemplateRef?

```ts
optional podGroupTemplateRef?: PodGroupTemplateReference;
```

Defined in: [lib/k8s/podGroup.ts:79](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L79)

Served by v1alpha2. Later versions use `workloadRef` instead.

***

### preemptionPolicy?

```ts
optional preemptionPolicy?: "Never" | "PreemptLowerPriority";
```

Defined in: [lib/k8s/podGroup.ts:93](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L93)

Served by v1alpha3 and v1beta1. Whether preemption may evict lower priority pods.

***

### priority?

```ts
optional priority?: number;
```

Defined in: [lib/k8s/podGroup.ts:89](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L89)

***

### priorityClassName?

```ts
optional priorityClassName?: string;
```

Defined in: [lib/k8s/podGroup.ts:88](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L88)

Set only when the WorkloadAwarePreemption feature gate is enabled.

***

### resourceClaims?

```ts
optional resourceClaims?: PodGroupResourceClaim[];
```

Defined in: [lib/k8s/podGroup.ts:103](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L103)

Set only when the DRAWorkloadResourceClaims feature gate is enabled.

***

### schedulingConstraints?

```ts
optional schedulingConstraints?: PodGroupSchedulingConstraints;
```

Defined in: [lib/k8s/podGroup.ts:101](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L101)

Set only when the TopologyAwareWorkloadScheduling feature gate is enabled.

***

### schedulingPolicy

```ts
schedulingPolicy: PodGroupSchedulingPolicy;
```

Defined in: [lib/k8s/podGroup.ts:77](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L77)

***

### workloadRef?

```ts
optional workloadRef?: PodGroupWorkloadReference;
```

Defined in: [lib/k8s/podGroup.ts:81](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L81)

Served by v1alpha3 and v1beta1. v1alpha2 uses `podGroupTemplateRef` instead.
