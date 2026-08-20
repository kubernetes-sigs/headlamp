# Interface: KubeObjectInterfaceCreate

Defined in: [lib/k8s/KubeObject.ts:756](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L756)

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

Defined in: [lib/k8s/KubeObject.ts:757](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L757)
