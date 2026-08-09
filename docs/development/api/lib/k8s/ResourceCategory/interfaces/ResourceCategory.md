# Interface: ResourceCategory

Defined in: [lib/k8s/ResourceCategory.tsx:26](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ResourceCategory.tsx#L26)

User friendly alternative to Kubernetes API groups

Combines multiple API groups along some resources from core (legacy) group
into one entity with a useful label.

## Properties

### apiGroups?

```ts
optional apiGroups?: string[];
```

Defined in: [lib/k8s/ResourceCategory.tsx:33](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ResourceCategory.tsx#L33)

Which api groups are included

***

### coreKinds?

```ts
optional coreKinds?: string[];
```

Defined in: [lib/k8s/ResourceCategory.tsx:35](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ResourceCategory.tsx#L35)

Which kinds from core api group are included

***

### description

```ts
description: string;
```

Defined in: [lib/k8s/ResourceCategory.tsx:31](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ResourceCategory.tsx#L31)

Description of the group

***

### excludeKinds?

```ts
optional excludeKinds?: string[];
```

Defined in: [lib/k8s/ResourceCategory.tsx:37](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ResourceCategory.tsx#L37)

Ignore certain kinds from the groups

***

### icon

```ts
icon: string;
```

Defined in: [lib/k8s/ResourceCategory.tsx:29](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ResourceCategory.tsx#L29)

MDI icon

***

### label

```ts
label: string;
```

Defined in: [lib/k8s/ResourceCategory.tsx:27](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/ResourceCategory.tsx#L27)
