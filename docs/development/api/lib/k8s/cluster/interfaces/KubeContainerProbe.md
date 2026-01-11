# Interface: KubeContainerProbe

## Properties

### exec?

```ts
optional exec: object;
```

#### command

```ts
command: string[];
```

#### Defined in

[src/lib/k8s/cluster.ts:505](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L505)

***

### failureThreshold?

```ts
optional failureThreshold: number;
```

#### Defined in

[src/lib/k8s/cluster.ts:515](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L515)

***

### httpGet?

```ts
optional httpGet: object;
```

#### host?

```ts
optional host: string;
```

#### path?

```ts
optional path: string;
```

#### port

```ts
port: number;
```

#### scheme

```ts
scheme: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:499](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L499)

***

### initialDelaySeconds?

```ts
optional initialDelaySeconds: number;
```

#### Defined in

[src/lib/k8s/cluster.ts:511](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L511)

***

### periodSeconds?

```ts
optional periodSeconds: number;
```

#### Defined in

[src/lib/k8s/cluster.ts:513](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L513)

***

### successThreshold?

```ts
optional successThreshold: number;
```

#### Defined in

[src/lib/k8s/cluster.ts:514](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L514)

***

### tcpSocket?

```ts
optional tcpSocket: object;
```

#### port

```ts
port: number;
```

#### Defined in

[src/lib/k8s/cluster.ts:508](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L508)

***

### timeoutSeconds?

```ts
optional timeoutSeconds: number;
```

#### Defined in

[src/lib/k8s/cluster.ts:512](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L512)
