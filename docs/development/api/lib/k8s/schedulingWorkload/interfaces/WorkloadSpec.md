# Interface: WorkloadSpec

Defined in: [lib/k8s/schedulingWorkload.ts:97](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L97)

## Properties

### compositePodGroupTemplates?

```ts
optional compositePodGroupTemplates?: CompositePodGroupTemplate[];
```

Defined in: [lib/k8s/schedulingWorkload.ts:103](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L103)

Served by v1alpha3 and v1beta1. Templates that schedule several pod groups together.

***

### controllerRef?

```ts
optional controllerRef?: object;
```

Defined in: [lib/k8s/schedulingWorkload.ts:105](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L105)

The object this Workload was created for, such as a Deployment or a Job.

#### apiGroup?

```ts
optional apiGroup?: string;
```

#### kind

```ts
kind: string;
```

#### name

```ts
name: string;
```

***

### podGroupTemplates?

```ts
optional podGroupTemplates?: PodGroupTemplate[];
```

Defined in: [lib/k8s/schedulingWorkload.ts:99](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/schedulingWorkload.ts#L99)

Exactly one of this and `compositePodGroupTemplates` is set.
