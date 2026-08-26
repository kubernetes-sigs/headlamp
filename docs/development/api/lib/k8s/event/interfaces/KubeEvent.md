# Interface: KubeEvent

Defined in: [lib/k8s/event.ts:26](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/event.ts#L26)

## Indexable

```ts
[otherProps: string]: any
```

## Properties

### involvedObject

```ts
involvedObject: object;
```

Defined in: [lib/k8s/event.ts:31](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/event.ts#L31)

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

***

### message

```ts
message: string;
```

Defined in: [lib/k8s/event.ts:29](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/event.ts#L29)

***

### metadata

```ts
metadata: KubeMetadata;
```

Defined in: [lib/k8s/event.ts:30](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/event.ts#L30)

***

### reason

```ts
reason: string;
```

Defined in: [lib/k8s/event.ts:28](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/event.ts#L28)

***

### type

```ts
type: string;
```

Defined in: [lib/k8s/event.ts:27](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/event.ts#L27)
