# Interface: ReferenceGrantTo

ReferenceGrantTo defines the target resource (e.g., Service or Secret) that can be referenced.

## See

 - [https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant) Gateway API reference for ReferenceGrant
 - [https://gateway-api.sigs.k8s.io/api-types/referencegrant/#structure](https://gateway-api.sigs.k8s.io/api-types/referencegrant/#structure) Gateway API definition for ReferenceGrantTo

## Properties

### group

```ts
group: string;
```

#### Defined in

[src/lib/k8s/referenceGrant.ts:41](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/referenceGrant.ts#L41)

***

### kind

```ts
kind: string;
```

#### Defined in

[src/lib/k8s/referenceGrant.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/referenceGrant.ts#L42)

***

### name?

```ts
optional name: string;
```

#### Defined in

[src/lib/k8s/referenceGrant.ts:43](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/referenceGrant.ts#L43)
