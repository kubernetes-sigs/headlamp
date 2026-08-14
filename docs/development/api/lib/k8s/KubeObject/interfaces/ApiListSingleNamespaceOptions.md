# Interface: ApiListSingleNamespaceOptions

Defined in: [lib/k8s/KubeObject.ts:705](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L705)

## Properties

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/KubeObject.ts:711](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L711)

The cluster to get the object from. By default uses the current cluster being viewed.

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/KubeObject.ts:707](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L707)

The namespace to get the object from.

***

### queryParams?

```ts
optional queryParams?: QueryParameters;
```

Defined in: [lib/k8s/KubeObject.ts:709](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/KubeObject.ts#L709)

The parameters to be passed to the API endpoint.
