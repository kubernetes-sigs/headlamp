# Variable: KubeObjectEndpoint

```ts
KubeObjectEndpoint: object;
```

Defined in: [lib/k8s/api/v2/KubeObjectEndpoint.ts:17](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/api/v2/KubeObjectEndpoint.ts#L17)

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
