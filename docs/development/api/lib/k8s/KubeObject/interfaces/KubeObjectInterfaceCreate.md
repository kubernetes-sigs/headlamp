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

[src/lib/k8s/KubeObject.ts:739](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/KubeObject.ts#L739)
