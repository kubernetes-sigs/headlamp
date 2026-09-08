# ~~Type Alias: sectionFunc~~

```ts
type sectionFunc = (resource: KubeObject) => 
  | SectionFuncProps
  | null
  | undefined;
```

Defined in: [plugin/registry.tsx:188](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L188)

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
