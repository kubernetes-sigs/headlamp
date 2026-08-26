# Interface: KubeCondition

Defined in: [lib/k8s/cluster.ts:164](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L164)

## Properties

### lastProbeTime

```ts
lastProbeTime: Time;
```

Defined in: [lib/k8s/cluster.ts:166](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L166)

Last time we probed the condition.

***

### lastTransitionTime?

```ts
optional lastTransitionTime?: Time;
```

Defined in: [lib/k8s/cluster.ts:167](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L167)

***

### lastUpdateTime?

```ts
optional lastUpdateTime?: Time;
```

Defined in: [lib/k8s/cluster.ts:168](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L168)

***

### message?

```ts
optional message?: string;
```

Defined in: [lib/k8s/cluster.ts:169](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L169)

***

### reason?

```ts
optional reason?: string;
```

Defined in: [lib/k8s/cluster.ts:171](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L171)

Unique, one-word, CamelCase reason for the condition's last transition.

***

### status

```ts
status: string;
```

Defined in: [lib/k8s/cluster.ts:173](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L173)

Status of the condition, one of True, False, Unknown.

***

### type

```ts
type: string;
```

Defined in: [lib/k8s/cluster.ts:174](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/cluster.ts#L174)
