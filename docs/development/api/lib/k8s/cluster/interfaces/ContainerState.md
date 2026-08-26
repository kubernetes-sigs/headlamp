# Interface: ContainerState

Defined in: [lib/k8s/cluster.ts:552](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L552)

## Properties

### running

```ts
running: object;
```

Defined in: [lib/k8s/cluster.ts:553](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L553)

#### startedAt

```ts
startedAt: string;
```

***

### terminated

```ts
terminated: object;
```

Defined in: [lib/k8s/cluster.ts:556](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L556)

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

Defined in: [lib/k8s/cluster.ts:565](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L565)

#### message?

```ts
optional message?: string;
```

#### reason

```ts
reason: string;
```
