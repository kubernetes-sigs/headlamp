# Interface: KubeContainerStatus

## Properties

### containerID?

```ts
optional containerID: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:563](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L563)

***

### image

```ts
image: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:564](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L564)

***

### imageID

```ts
imageID: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:565](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L565)

***

### lastState

```ts
lastState: Partial<ContainerState>;
```

#### Defined in

[src/lib/k8s/cluster.ts:569](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L569)

***

### name

```ts
name: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:566](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L566)

***

### ready

```ts
ready: boolean;
```

#### Defined in

[src/lib/k8s/cluster.ts:567](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L567)

***

### restartCount

```ts
restartCount: number;
```

#### Defined in

[src/lib/k8s/cluster.ts:568](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L568)

***

### started?

```ts
optional started: boolean;
```

#### Defined in

[src/lib/k8s/cluster.ts:571](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L571)

***

### state

```ts
state: Partial<ContainerState>;
```

#### Defined in

[src/lib/k8s/cluster.ts:570](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L570)
