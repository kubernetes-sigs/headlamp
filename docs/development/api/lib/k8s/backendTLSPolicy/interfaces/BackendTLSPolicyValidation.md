# Interface: BackendTLSPolicyValidation

Defined in: [lib/k8s/backendTLSPolicy.ts:36](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/backendTLSPolicy.ts#L36)

BackendTLSPolicyValidation defines TLS validation settings such as trusted CA and SAN.

## See

[https://gateway-api.sigs.k8s.io/api-types/backendtlspolicy/#structure](https://gateway-api.sigs.k8s.io/api-types/backendtlspolicy/#structure)

## Properties

### caCertificateRefs

```ts
caCertificateRefs: object[];
```

Defined in: [lib/k8s/backendTLSPolicy.ts:37](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/backendTLSPolicy.ts#L37)

#### group

```ts
group: string;
```

#### kind

```ts
kind: string;
```

#### name

```ts
name: string;
```

***

### hostname

```ts
hostname: string;
```

Defined in: [lib/k8s/backendTLSPolicy.ts:42](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/backendTLSPolicy.ts#L42)
