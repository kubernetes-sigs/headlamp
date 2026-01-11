# Interface: KubeObjectInterfaceCreate

KubeObjectInterfaceCreate is a version of KubeObjectInterface for creating objects
where uid, creationTimestamp, etc. are optional

## Extends

- `Omit`\<[`KubeObjectInterface`](KubeObjectInterface.md), `"metadata"`\>

## Properties

### metadata

```ts
metadata: KubeMetadataCreate;
```

#### Defined in

[src/lib/k8s/KubeObject.ts:739](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/KubeObject.ts#L739)
