# Interface: KubeObjectInterfaceCreate

Defined in: [lib/k8s/KubeObject.ts:688](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L688)

KubeObjectInterfaceCreate is a version of KubeObjectInterface for creating objects
where uid, creationTimestamp, etc. are optional

## Extends

- `Omit`\<[`KubeObjectInterface`](KubeObjectInterface.md), `"metadata"`\>

## Indexable

```ts
[key: string]: any
```

```ts
[key: number]: any
```

## Properties

### metadata

```ts
metadata: KubeMetadataCreate;
```

Defined in: [lib/k8s/KubeObject.ts:689](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L689)
