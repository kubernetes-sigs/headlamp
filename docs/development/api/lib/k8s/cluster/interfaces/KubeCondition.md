# Interface: KubeCondition

## Properties

### lastProbeTime

```ts
lastProbeTime: Time;
```

Last time we probed the condition.

#### Defined in

[src/lib/k8s/cluster.ts:166](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L166)

***

### lastTransitionTime?

```ts
optional lastTransitionTime: Time;
```

#### Defined in

[src/lib/k8s/cluster.ts:167](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L167)

***

### lastUpdateTime?

```ts
optional lastUpdateTime: Time;
```

#### Defined in

[src/lib/k8s/cluster.ts:168](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L168)

***

### message?

```ts
optional message: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:169](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L169)

***

### reason?

```ts
optional reason: string;
```

Unique, one-word, CamelCase reason for the condition's last transition.

#### Defined in

[src/lib/k8s/cluster.ts:171](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L171)

***

### status

```ts
status: string;
```

Status of the condition, one of True, False, Unknown.

#### Defined in

[src/lib/k8s/cluster.ts:173](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L173)

***

### type

```ts
type: string;
```

#### Defined in

[src/lib/k8s/cluster.ts:174](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/cluster.ts#L174)
