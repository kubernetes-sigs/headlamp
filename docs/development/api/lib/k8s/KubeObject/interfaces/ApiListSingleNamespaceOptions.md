# Interface: ApiListSingleNamespaceOptions

Defined in: [lib/k8s/KubeObject.ts:773](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L773)

## Properties

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/KubeObject.ts:779](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L779)

The cluster to get the object from. By default uses the current cluster being viewed.

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/KubeObject.ts:775](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L775)

The namespace to get the object from.

***

### queryParams?

```ts
optional queryParams?: QueryParameters;
```

Defined in: [lib/k8s/KubeObject.ts:777](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/KubeObject.ts#L777)

The parameters to be passed to the API endpoint.
