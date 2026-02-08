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

[src/lib/k8s/backendTLSPolicy.ts:37](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTLSPolicy.ts#L37)

***

### hostname

```ts
hostname: string;
```

#### Defined in

[src/lib/k8s/backendTLSPolicy.ts:42](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/lib/k8s/backendTLSPolicy.ts#L42)
