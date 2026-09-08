# Interface: PodGroupDisruptionMode

Defined in: [lib/k8s/podGroup.ts:71](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L71)

How v1alpha3 and v1beta1 describe which pods a disruption affects. Exactly one field
is set: `single` matches the v1alpha2 'Pod' mode, `all` matches 'PodGroup'.

## Properties

### all?

```ts
optional all?: Record<string, never>;
```

Defined in: [lib/k8s/podGroup.ts:73](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L73)

***

### single?

```ts
optional single?: Record<string, never>;
```

Defined in: [lib/k8s/podGroup.ts:72](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/podGroup.ts#L72)
