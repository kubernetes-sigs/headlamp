# Interface: ApiListSingleNamespaceOptions

Defined in: [lib/k8s/KubeObject.ts:821](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L821)

## Properties

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/KubeObject.ts:827](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L827)

The cluster to get the object from. By default uses the current cluster being viewed.

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/KubeObject.ts:823](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L823)

The namespace to get the object from.

***

### queryParams?

```ts
optional queryParams?: QueryParameters;
```

Defined in: [lib/k8s/KubeObject.ts:825](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/KubeObject.ts#L825)

The parameters to be passed to the API endpoint.
