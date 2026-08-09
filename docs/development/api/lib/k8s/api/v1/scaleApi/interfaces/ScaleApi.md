# Interface: ScaleApi

Defined in: [lib/k8s/api/v1/scaleApi.ts:21](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/scaleApi.ts#L21)

## Properties

### get

```ts
get: (namespace: string, name: string, clusterName?: string) => Promise<any>;
```

Defined in: [lib/k8s/api/v1/scaleApi.ts:22](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/scaleApi.ts#L22)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `namespace` | `string` |
| `name` | `string` |
| `clusterName?` | `string` |

#### Returns

`Promise`\<`any`\>

***

### patch

```ts
patch: (body: object, metadata: KubeMetadata, clusterName?: string) => Promise<any>;
```

Defined in: [lib/k8s/api/v1/scaleApi.ts:32](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/scaleApi.ts#L32)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | \{ `spec`: \{ `replicas`: `number`; \}; \} |
| `body.spec` | \{ `replicas`: `number`; \} |
| `body.spec.replicas` | `number` |
| `metadata?` | [`KubeMetadata`](../../../../KubeMetadata/interfaces/KubeMetadata.md) |
| `clusterName?` | `string` |

#### Returns

`Promise`\<`any`\>

***

### put

```ts
put: (body: object, clusterName?: string) => Promise<any>;
```

Defined in: [lib/k8s/api/v1/scaleApi.ts:23](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v1/scaleApi.ts#L23)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | \{ `metadata`: [`KubeMetadata`](../../../../KubeMetadata/interfaces/KubeMetadata.md); `spec`: \{ `replicas`: `number`; \}; \} |
| `body.metadata` | [`KubeMetadata`](../../../../KubeMetadata/interfaces/KubeMetadata.md) |
| `body.spec?` | \{ `replicas`: `number`; \} |
| `body.spec.replicas?` | `number` |
| `clusterName?` | `string` |

#### Returns

`Promise`\<`any`\>
