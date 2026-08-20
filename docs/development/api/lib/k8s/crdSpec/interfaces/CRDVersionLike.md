# Interface: CRDVersionLike

Defined in: [lib/k8s/crdSpec.ts:42](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/crdSpec.ts#L42)

Subset of a CRD `spec.versions[i]` entry used by the helpers. All fields
are optional because partial watch updates can deliver a half-populated
entry; the validation logic decides what counts as usable.

## Properties

### name?

```ts
optional name?: string;
```

Defined in: [lib/k8s/crdSpec.ts:43](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/crdSpec.ts#L43)

***

### served?

```ts
optional served?: boolean;
```

Defined in: [lib/k8s/crdSpec.ts:44](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/crdSpec.ts#L44)

***

### storage?

```ts
optional storage?: boolean;
```

Defined in: [lib/k8s/crdSpec.ts:45](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/crdSpec.ts#L45)
