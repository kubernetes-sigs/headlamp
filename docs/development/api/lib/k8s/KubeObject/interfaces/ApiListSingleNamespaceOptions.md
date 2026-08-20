# Interface: ApiListSingleNamespaceOptions

Defined in: [lib/k8s/KubeObject.ts:822](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L822)

## Properties

### cluster?

```ts
optional cluster?: string;
```

Defined in: [lib/k8s/KubeObject.ts:828](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L828)

The cluster to get the object from. By default uses the current cluster being viewed.

***

### namespace?

```ts
optional namespace?: string;
```

Defined in: [lib/k8s/KubeObject.ts:824](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L824)

The namespace to get the object from.

***

### queryParams?

```ts
optional queryParams?: QueryParameters;
```

Defined in: [lib/k8s/KubeObject.ts:826](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/KubeObject.ts#L826)

The parameters to be passed to the API endpoint.
