# Interface: KubeObjectInterfaceCreate

Defined in: [lib/k8s/KubeObject.ts:805](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L805)

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

Defined in: [lib/k8s/KubeObject.ts:806](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L806)
