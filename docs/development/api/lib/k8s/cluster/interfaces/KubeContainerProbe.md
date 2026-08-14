# Interface: KubeContainerProbe

Defined in: [lib/k8s/cluster.ts:498](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L498)

## Properties

### exec?

```ts
optional exec?: object;
```

Defined in: [lib/k8s/cluster.ts:505](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L505)

#### command

```ts
command: string[];
```

***

### failureThreshold?

```ts
optional failureThreshold?: number;
```

Defined in: [lib/k8s/cluster.ts:515](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L515)

***

### httpGet?

```ts
optional httpGet?: object;
```

Defined in: [lib/k8s/cluster.ts:499](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L499)

#### host?

```ts
optional host?: string;
```

#### path?

```ts
optional path?: string;
```

#### port

```ts
port: number;
```

#### scheme

```ts
scheme: string;
```

***

### initialDelaySeconds?

```ts
optional initialDelaySeconds?: number;
```

Defined in: [lib/k8s/cluster.ts:511](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L511)

***

### periodSeconds?

```ts
optional periodSeconds?: number;
```

Defined in: [lib/k8s/cluster.ts:513](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L513)

***

### successThreshold?

```ts
optional successThreshold?: number;
```

Defined in: [lib/k8s/cluster.ts:514](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L514)

***

### tcpSocket?

```ts
optional tcpSocket?: object;
```

Defined in: [lib/k8s/cluster.ts:508](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L508)

#### port

```ts
port: number;
```

***

### timeoutSeconds?

```ts
optional timeoutSeconds?: number;
```

Defined in: [lib/k8s/cluster.ts:512](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/cluster.ts#L512)
