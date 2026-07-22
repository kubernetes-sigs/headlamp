# Variable: KubeObjectEndpoint

```ts
KubeObjectEndpoint: object;
```

Defined in: [lib/k8s/api/v2/KubeObjectEndpoint.ts:17](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/lib/k8s/api/v2/KubeObjectEndpoint.ts#L17)

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
