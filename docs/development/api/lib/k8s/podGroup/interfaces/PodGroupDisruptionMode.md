# Interface: PodGroupDisruptionMode

Defined in: [lib/k8s/podGroup.ts:71](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/podGroup.ts#L71)

How v1alpha3 and v1beta1 describe which pods a disruption affects. Exactly one field
is set: `single` matches the v1alpha2 'Pod' mode, `all` matches 'PodGroup'.

## Properties

### all?

```ts
optional all?: Record<string, never>;
```

Defined in: [lib/k8s/podGroup.ts:73](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/podGroup.ts#L73)

***

### single?

```ts
optional single?: Record<string, never>;
```

Defined in: [lib/k8s/podGroup.ts:72](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/podGroup.ts#L72)
