# Interface: KubeEndpointAddress

Defined in: [lib/k8s/endpoints.ts:28](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/endpoints.ts#L28)

## Properties

### hostname

```ts
hostname: string;
```

Defined in: [lib/k8s/endpoints.ts:29](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/endpoints.ts#L29)

***

### ip

```ts
ip: string;
```

Defined in: [lib/k8s/endpoints.ts:30](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/endpoints.ts#L30)

***

### nodeName?

```ts
optional nodeName?: string;
```

Defined in: [lib/k8s/endpoints.ts:31](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/endpoints.ts#L31)

***

### targetRef?

```ts
optional targetRef?: Pick<KubeObjectInterface, "apiVersion" | "kind"> & Pick<KubeMetadata, "namespace" | "uid" | "name" | "resourceVersion"> & object;
```

Defined in: [lib/k8s/endpoints.ts:32](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/endpoints.ts#L32)

#### Type Declaration

##### fieldPath

```ts
fieldPath: string;
```
