# Interface: PodGroupSchedulingPolicy

Defined in: [lib/k8s/podGroup.ts:35](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/podGroup.ts#L35)

How the pods of a group are scheduled. Exactly one field is set: `gang` for
all-or-nothing semantics, `basic` for standard Kubernetes scheduling.

## Properties

### basic?

```ts
optional basic?: Record<string, never>;
```

Defined in: [lib/k8s/podGroup.ts:36](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/podGroup.ts#L36)

***

### gang?

```ts
optional gang?: object;
```

Defined in: [lib/k8s/podGroup.ts:37](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/podGroup.ts#L37)

#### minCount

```ts
minCount: number;
```
