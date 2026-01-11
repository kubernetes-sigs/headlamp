# Interface: BackendTLSPolicyValidation

BackendTLSPolicyValidation defines TLS validation settings such as trusted CA and SAN.

## See

[https://gateway-api.sigs.k8s.io/api-types/backendtlspolicy/#structure](https://gateway-api.sigs.k8s.io/api-types/backendtlspolicy/#structure)

## Properties

### caCertificateRefs

```ts
caCertificateRefs: object[];
```

#### Defined in

[src/lib/k8s/backendTLSPolicy.ts:37](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTLSPolicy.ts#L37)

***

### hostname

```ts
hostname: string;
```

#### Defined in

[src/lib/k8s/backendTLSPolicy.ts:42](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/lib/k8s/backendTLSPolicy.ts#L42)
