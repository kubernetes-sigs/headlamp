# ~~Type Alias: sectionFunc~~

```ts
type sectionFunc = (resource: KubeObject) => 
  | SectionFuncProps
  | null
  | undefined;
```

Defined in: [plugin/registry.tsx:166](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L166)

## Parameters

| Parameter | Type |
| ------ | ------ |
| `resource` | [`KubeObject`](../../../lib/k8s/KubeObject/classes/KubeObject.md) |

## Returns

  \| [`SectionFuncProps`](../interfaces/SectionFuncProps.md)
  \| `null`
  \| `undefined`

## Deprecated

please used DetailsViewSectionType and registerDetailViewSection
