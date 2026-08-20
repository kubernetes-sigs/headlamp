# Interface: KubeWebhookClientConfig

Defined in: [lib/k8s/mutatingWebhookConfiguration.ts:29](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/mutatingWebhookConfiguration.ts#L29)

## Properties

### caBundle

```ts
caBundle: string;
```

Defined in: [lib/k8s/mutatingWebhookConfiguration.ts:30](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/mutatingWebhookConfiguration.ts#L30)

***

### service?

```ts
optional service?: object;
```

Defined in: [lib/k8s/mutatingWebhookConfiguration.ts:32](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/mutatingWebhookConfiguration.ts#L32)

#### name

```ts
name: string;
```

#### namespace

```ts
namespace: string;
```

#### path?

```ts
optional path?: string;
```

#### port?

```ts
optional port?: number;
```

***

### url?

```ts
optional url?: string;
```

Defined in: [lib/k8s/mutatingWebhookConfiguration.ts:31](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/mutatingWebhookConfiguration.ts#L31)
