# Variable: KubeObjectEndpoint

```ts
KubeObjectEndpoint: object;
```

Defined in: [lib/k8s/api/v2/KubeObjectEndpoint.ts:17](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/lib/k8s/api/v2/KubeObjectEndpoint.ts#L17)

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
