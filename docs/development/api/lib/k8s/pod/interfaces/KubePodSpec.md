# Interface: KubePodSpec

## Properties

### containers

```ts
containers: KubeContainer[];
```

#### Defined in

[src/lib/k8s/pod.ts:31](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L31)

***

### ephemeralContainers?

```ts
optional ephemeralContainers: KubeContainer[];
```

#### Defined in

[src/lib/k8s/pod.ts:37](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L37)

***

### initContainers?

```ts
optional initContainers: KubeContainer[];
```

#### Defined in

[src/lib/k8s/pod.ts:36](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L36)

***

### nodeName

```ts
nodeName: string;
```

#### Defined in

[src/lib/k8s/pod.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L32)

***

### nodeSelector?

```ts
optional nodeSelector: object;
```

#### Index Signature

 \[`key`: `string`\]: `string`

#### Defined in

[src/lib/k8s/pod.ts:33](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L33)

***

### priority?

```ts
optional priority: string;
```

#### Defined in

[src/lib/k8s/pod.ts:44](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L44)

***

### readinessGates?

```ts
optional readinessGates: object[];
```

#### Defined in

[src/lib/k8s/pod.ts:38](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L38)

***

### restartPolicy?

```ts
optional restartPolicy: string;
```

#### Defined in

[src/lib/k8s/pod.ts:46](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L46)

***

### serviceAccount?

```ts
optional serviceAccount: string;
```

#### Defined in

[src/lib/k8s/pod.ts:43](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L43)

***

### serviceAccountName?

```ts
optional serviceAccountName: string;
```

#### Defined in

[src/lib/k8s/pod.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L42)

***

### tolerations?

```ts
optional tolerations: any[];
```

#### Defined in

[src/lib/k8s/pod.ts:45](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L45)

***

### volumes?

```ts
optional volumes: KubeVolume[];
```

#### Defined in

[src/lib/k8s/pod.ts:41](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/pod.ts#L41)
