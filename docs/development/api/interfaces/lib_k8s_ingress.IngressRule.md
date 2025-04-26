[API](../API.md) / [lib/k8s/ingress](../modules/lib_k8s_ingress.md) / IngressRule

# Interface: IngressRule

[lib/k8s/ingress](../modules/lib_k8s_ingress.md).IngressRule

## Properties

### host

• **host**: `string`

#### Defined in

[lib/k8s/ingress.ts:15](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/ingress.ts#L15)

___

### http

• **http**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `paths` | { `backend`: [`IngressBackend`](lib_k8s_ingress.IngressBackend.md) ; `path`: `string` ; `pathType?`: `string`  }[] |

#### Defined in

[lib/k8s/ingress.ts:16](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/ingress.ts#L16)
