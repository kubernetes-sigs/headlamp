# Variable: KubeObjectEndpoint

```ts
KubeObjectEndpoint: object;
```

Defined in: [lib/k8s/api/v2/KubeObjectEndpoint.ts:17](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/api/v2/KubeObjectEndpoint.ts#L17)

## Type Declaration

### toUrl

```ts
toUrl: (endpoint: KubeObjectEndpoint, namespace?: string) => string;
```

Formats endpoints information into a URL path

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `endpoint` | [`KubeObjectEndpoint`](../interfaces/KubeObjectEndpoint.md) | Kubernetes resource endpoint definition |
| `namespace?` | `string` | Namespace, optional |

#### Returns

`string`

Formatted URL path
