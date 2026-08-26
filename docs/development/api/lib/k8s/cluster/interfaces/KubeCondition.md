# Interface: KubeCondition

Defined in: [lib/k8s/cluster.ts:163](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L163)

## Properties

### lastProbeTime

```ts
lastProbeTime: Time;
```

Defined in: [lib/k8s/cluster.ts:165](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L165)

Last time we probed the condition.

***

### lastTransitionTime?

```ts
optional lastTransitionTime?: Time;
```

Defined in: [lib/k8s/cluster.ts:166](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L166)

***

### lastUpdateTime?

```ts
optional lastUpdateTime?: Time;
```

Defined in: [lib/k8s/cluster.ts:167](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L167)

***

### message?

```ts
optional message?: string;
```

Defined in: [lib/k8s/cluster.ts:168](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L168)

***

### reason?

```ts
optional reason?: string;
```

Defined in: [lib/k8s/cluster.ts:170](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L170)

Unique, one-word, CamelCase reason for the condition's last transition.

***

### status

```ts
status: string;
```

Defined in: [lib/k8s/cluster.ts:172](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L172)

Status of the condition, one of True, False, Unknown.

***

### type

```ts
type: string;
```

Defined in: [lib/k8s/cluster.ts:173](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/cluster.ts#L173)
