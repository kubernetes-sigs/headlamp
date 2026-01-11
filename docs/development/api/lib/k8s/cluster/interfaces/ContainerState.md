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

[src/lib/k8s/cluster.ts:544](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L544)

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

[src/lib/k8s/cluster.ts:547](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L547)

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

[src/lib/k8s/cluster.ts:556](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L556)
