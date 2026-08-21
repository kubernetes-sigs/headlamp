# Interface: CRDSpecLike

Defined in: [lib/k8s/crdSpec.ts:24](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L24)

Subset of the `KubeCRD['spec']` shape that the helpers below depend on.
Lives in this standalone module so the helpers can be imported (and unit
tested) without pulling in `lib/k8s/index.ts`, which transitively loads
every built-in resource class and creates a circular import that vitest
cannot resolve in isolation.

## Properties

### group?

```ts
optional group?: string;
```

Defined in: [lib/k8s/crdSpec.ts:25](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L25)

***

### names?

```ts
optional names?: object;
```

Defined in: [lib/k8s/crdSpec.ts:27](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L27)

#### kind?

```ts
optional kind?: string;
```

#### listKind?

```ts
optional listKind?: string;
```

#### plural?

```ts
optional plural?: string;
```

#### singular?

```ts
optional singular?: string;
```

***

### scope?

```ts
optional scope?: string;
```

Defined in: [lib/k8s/crdSpec.ts:34](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L34)

***

### version?

```ts
optional version?: string;
```

Defined in: [lib/k8s/crdSpec.ts:26](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L26)

***

### versions?

```ts
optional versions?: CRDVersionLike[];
```

Defined in: [lib/k8s/crdSpec.ts:33](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/crdSpec.ts#L33)
