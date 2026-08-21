# Interface: CompositePodGroupSchedulingPolicy

Defined in: [lib/k8s/schedulingWorkload.ts:55](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L55)

How the child groups of a composite template are scheduled. Mirrors
PodGroupSchedulingPolicy, except that the gang policy counts child groups rather
than pods.

## Properties

### basic?

```ts
optional basic?: Record<string, never>;
```

Defined in: [lib/k8s/schedulingWorkload.ts:56](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L56)

***

### gang?

```ts
optional gang?: object;
```

Defined in: [lib/k8s/schedulingWorkload.ts:57](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/schedulingWorkload.ts#L57)

#### minGroupCount

```ts
minGroupCount: number;
```
