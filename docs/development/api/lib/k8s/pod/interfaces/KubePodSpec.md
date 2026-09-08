# Interface: KubePodSpec

Defined in: [lib/k8s/pod.ts:47](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L47)

## Properties

### containers

```ts
containers: KubeContainer[];
```

Defined in: [lib/k8s/pod.ts:48](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L48)

***

### ephemeralContainers?

```ts
optional ephemeralContainers?: KubeContainer[];
```

Defined in: [lib/k8s/pod.ts:54](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L54)

***

### initContainers?

```ts
optional initContainers?: KubeContainer[];
```

Defined in: [lib/k8s/pod.ts:53](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L53)

***

### nodeName

```ts
nodeName: string;
```

Defined in: [lib/k8s/pod.ts:49](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L49)

***

### nodeSelector?

```ts
optional nodeSelector?: object;
```

Defined in: [lib/k8s/pod.ts:50](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L50)

#### Index Signature

```ts
[key: string]: string
```

***

### priority?

```ts
optional priority?: number;
```

Defined in: [lib/k8s/pod.ts:61](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L61)

***

### priorityClassName?

```ts
optional priorityClassName?: string;
```

Defined in: [lib/k8s/pod.ts:62](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L62)

***

### readinessGates?

```ts
optional readinessGates?: object[];
```

Defined in: [lib/k8s/pod.ts:55](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L55)

#### conditionType

```ts
conditionType: string;
```

***

### restartPolicy?

```ts
optional restartPolicy?: string;
```

Defined in: [lib/k8s/pod.ts:66](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L66)

***

### runtimeClassName?

```ts
optional runtimeClassName?: string;
```

Defined in: [lib/k8s/pod.ts:63](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L63)

***

### schedulingGroup?

```ts
optional schedulingGroup?: object;
```

Defined in: [lib/k8s/pod.ts:71](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L71)

The scheduling group this Pod belongs to. Set only when the GenericWorkload
feature gate is enabled on the cluster.

#### podGroupName

```ts
podGroupName: string;
```

***

### serviceAccount?

```ts
optional serviceAccount?: string;
```

Defined in: [lib/k8s/pod.ts:60](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L60)

***

### serviceAccountName?

```ts
optional serviceAccountName?: string;
```

Defined in: [lib/k8s/pod.ts:59](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L59)

***

### terminationGracePeriodSeconds?

```ts
optional terminationGracePeriodSeconds?: number;
```

Defined in: [lib/k8s/pod.ts:64](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L64)

***

### tolerations?

```ts
optional tolerations?: any[];
```

Defined in: [lib/k8s/pod.ts:65](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L65)

***

### volumes?

```ts
optional volumes?: KubeVolume[];
```

Defined in: [lib/k8s/pod.ts:58](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/pod.ts#L58)
