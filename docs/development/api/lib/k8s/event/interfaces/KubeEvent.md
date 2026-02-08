# Interface: KubeEvent

## Indexable

 \[`otherProps`: `string`\]: `any`

## Properties

### involvedObject

```ts
involvedObject: object;
```

#### apiVersion

```ts
apiVersion: string;
```

#### fieldPath

```ts
fieldPath: string;
```

#### kind

```ts
kind: string;
```

#### name

```ts
name: string;
```

#### namespace

```ts
namespace: string;
```

#### resourceVersion

```ts
resourceVersion: string;
```

#### uid

```ts
uid: string;
```

#### Defined in

[src/lib/k8s/event.ts:32](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/event.ts#L32)

***

### message

```ts
message: string;
```

#### Defined in

[src/lib/k8s/event.ts:30](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/event.ts#L30)

***

### metadata

```ts
metadata: KubeMetadata;
```

#### Defined in

[src/lib/k8s/event.ts:31](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/event.ts#L31)

***

### reason

```ts
reason: string;
```

#### Defined in

[src/lib/k8s/event.ts:29](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/event.ts#L29)

***

### type

```ts
type: string;
```

#### Defined in

[src/lib/k8s/event.ts:28](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/event.ts#L28)
