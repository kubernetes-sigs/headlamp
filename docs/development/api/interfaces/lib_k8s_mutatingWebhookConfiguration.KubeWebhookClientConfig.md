[API](../API.md) / [lib/k8s/mutatingWebhookConfiguration](../modules/lib_k8s_mutatingWebhookConfiguration.md) / KubeWebhookClientConfig

# Interface: KubeWebhookClientConfig

[lib/k8s/mutatingWebhookConfiguration](../modules/lib_k8s_mutatingWebhookConfiguration.md).KubeWebhookClientConfig

## Properties

### caBundle

• **caBundle**: `string`

#### Defined in

[lib/k8s/mutatingWebhookConfiguration.ts:13](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/mutatingWebhookConfiguration.ts#L13)

___

### service

• `Optional` **service**: `Object`

#### Type declaration

| Name | Type |
| :------ | :------ |
| `name` | `string` |
| `namespace` | `string` |
| `path?` | `string` |
| `port?` | `number` |

#### Defined in

[lib/k8s/mutatingWebhookConfiguration.ts:15](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/mutatingWebhookConfiguration.ts#L15)

___

### url

• `Optional` **url**: `string`

#### Defined in

[lib/k8s/mutatingWebhookConfiguration.ts:14](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/mutatingWebhookConfiguration.ts#L14)
