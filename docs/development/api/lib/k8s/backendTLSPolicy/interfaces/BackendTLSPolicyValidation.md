# Interface: BackendTLSPolicyValidation

Defined in: [lib/k8s/backendTLSPolicy.ts:36](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTLSPolicy.ts#L36)

BackendTLSPolicyValidation defines TLS validation settings such as trusted CA and SAN.

## See

[https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#backendtlspolicyvalidation](https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#backendtlspolicyvalidation)

## Properties

### caCertificateRefs

```ts
caCertificateRefs: object[];
```

Defined in: [lib/k8s/backendTLSPolicy.ts:37](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTLSPolicy.ts#L37)

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

Defined in: [lib/k8s/backendTLSPolicy.ts:42](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/backendTLSPolicy.ts#L42)
