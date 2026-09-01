# Interface: ApiListSingleNamespaceOptions

Defined in: [lib/k8s/KubeObject.ts:824](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L824)

## Properties

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/KubeObject.ts:830](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L830)

The cluster to get the object from. By default uses the current cluster being viewed.

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/KubeObject.ts:826](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L826)

The namespace to get the object from.

***

### queryParams?

```ts
optional queryParams?: QueryParameters;
```

Defined in: [lib/k8s/KubeObject.ts:828](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/KubeObject.ts#L828)

The parameters to be passed to the API endpoint.
