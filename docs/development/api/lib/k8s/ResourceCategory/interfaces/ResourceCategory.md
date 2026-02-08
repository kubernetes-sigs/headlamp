# Interface: ResourceCategory

User friendly alternative to Kubernetes API groups

Combines multiple API groups along some resources from core (legacy) group
into one entity with a useful label.

## Properties

### apiGroups?

```ts
optional apiGroups: string[];
```

Which api groups are included

#### Defined in

[src/lib/k8s/ResourceCategory.tsx:33](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/ResourceCategory.tsx#L33)

***

### coreKinds?

```ts
optional coreKinds: string[];
```

Which kinds from core api group are included

#### Defined in

[src/lib/k8s/ResourceCategory.tsx:35](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/ResourceCategory.tsx#L35)

***

### description

```ts
description: string;
```

Description of the group

#### Defined in

[src/lib/k8s/ResourceCategory.tsx:31](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/ResourceCategory.tsx#L31)

***

### excludeKinds?

```ts
optional excludeKinds: string[];
```

Ignore certain kinds from the groups

#### Defined in

[src/lib/k8s/ResourceCategory.tsx:37](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/ResourceCategory.tsx#L37)

***

### icon

```ts
icon: string;
```

MDI icon

#### Defined in

[src/lib/k8s/ResourceCategory.tsx:29](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/ResourceCategory.tsx#L29)

***

### label

```ts
label: string;
```

#### Defined in

[src/lib/k8s/ResourceCategory.tsx:27](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/ResourceCategory.tsx#L27)
