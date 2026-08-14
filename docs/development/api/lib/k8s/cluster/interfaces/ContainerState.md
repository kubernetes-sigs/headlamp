# Interface: ContainerState

Defined in: [lib/k8s/cluster.ts:543](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L543)

## Properties

### running

```ts
running: object;
```

Defined in: [lib/k8s/cluster.ts:544](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L544)

#### startedAt

```ts
startedAt: string;
```

***

### terminated

```ts
terminated: object;
```

Defined in: [lib/k8s/cluster.ts:547](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L547)

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
optional message?: string;
```

#### reason

```ts
reason: string;
```

#### signal?

```ts
optional signal?: number;
```

#### startedAt

```ts
startedAt: string;
```

***

### waiting

```ts
waiting: object;
```

Defined in: [lib/k8s/cluster.ts:556](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L556)

#### message?

```ts
optional message?: string;
```

#### reason

```ts
reason: string;
```
