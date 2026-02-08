# Interface: ContainerState

## Properties

### running

```ts
running: object;
```

#### startedAt

```ts
startedAt: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:544](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L544)

***

### terminated

```ts
terminated: object;
```

#### containerID

```ts
containerID: string;
```

#### exitCode

```ts
exitCode: number;
```

#### finishedAt

```ts
finishedAt: string;
```

#### message?

```ts
optional message: string;
```

#### reason

```ts
reason: string;
```

#### signal?

```ts
optional signal: number;
```

#### startedAt

```ts
startedAt: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:547](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L547)

***

### waiting

```ts
waiting: object;
```

#### message?

```ts
optional message: string;
```

#### reason

```ts
reason: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:556](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/cluster.ts#L556)
