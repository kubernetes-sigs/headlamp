# Interface: KubeContainerProbe

Defined in: [lib/k8s/cluster.ts:507](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L507)

## Properties

### exec?

```ts
optional exec?: object;
```

Defined in: [lib/k8s/cluster.ts:514](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L514)

#### command

```ts
command: string[];
```

***

### failureThreshold?

```ts
optional failureThreshold?: number;
```

Defined in: [lib/k8s/cluster.ts:524](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L524)

***

### httpGet?

```ts
optional httpGet?: object;
```

Defined in: [lib/k8s/cluster.ts:508](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L508)

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

Defined in: [lib/k8s/cluster.ts:520](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L520)

***

### periodSeconds?

```ts
optional periodSeconds?: number;
```

Defined in: [lib/k8s/cluster.ts:522](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L522)

***

### successThreshold?

```ts
optional successThreshold?: number;
```

Defined in: [lib/k8s/cluster.ts:523](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L523)

***

### tcpSocket?

```ts
optional tcpSocket?: object;
```

Defined in: [lib/k8s/cluster.ts:517](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L517)

#### port

```ts
port: number;
```

***

### timeoutSeconds?

```ts
optional timeoutSeconds?: number;
```

Defined in: [lib/k8s/cluster.ts:521](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L521)
