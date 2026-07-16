# ~~Type Alias: sectionFunc~~

```ts
type sectionFunc = (resource: KubeObject) => 
  | SectionFuncProps
  | null
  | undefined;
```

Defined in: [plugin/registry.tsx:166](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L166)

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
