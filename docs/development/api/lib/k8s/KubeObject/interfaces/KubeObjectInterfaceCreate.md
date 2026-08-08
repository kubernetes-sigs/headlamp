# Interface: KubeObjectInterfaceCreate

Defined in: [lib/k8s/KubeObject.ts:804](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L804)

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

Defined in: [lib/k8s/KubeObject.ts:805](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L805)
