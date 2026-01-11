# Class: Registry

## Constructors

### new Registry()

```ts
new Registry(): Registry
```

#### Returns

[`Registry`](Registry.md)

## Methods

### ~~registerAppBarAction()~~

```ts
registerAppBarAction(actionName: string, actionFunc: (...args: any[]) => ReactNode): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `actionName` | `string` |
| `actionFunc` | (...`args`: `any`[]) => `ReactNode` |

#### Returns

`void`

#### Deprecated

Registry.registerAppBarAction is deprecated. Please use registerAppBarAction.

#### Defined in

[src/plugin/registry.tsx:215](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L215)

***

### ~~registerAppLogo()~~

```ts
registerAppLogo(logo: AppLogoType): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `logo` | [`AppLogoType`](../type-aliases/AppLogoType.md) |

#### Returns

`void`

#### Deprecated

Registry.registerAppLogo is deprecated. Please use registerAppLogo.

#### Defined in

[src/plugin/registry.tsx:264](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L264)

***

### ~~registerClusterChooserComponent()~~

```ts
registerClusterChooserComponent(component: null | ComponentType<ClusterChooserProps>): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `component` | `null` \| `ComponentType`\<[`ClusterChooserProps`](../interfaces/ClusterChooserProps.md)\> |

#### Returns

`void`

#### Deprecated

Registry.registerClusterChooserComponent is deprecated. Please use registerClusterChooser.

#### Defined in

[src/plugin/registry.tsx:272](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L272)

***

### ~~registerDetailsViewHeaderAction()~~

```ts
registerDetailsViewHeaderAction(actionName: string, actionFunc: HeaderActionType): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `actionName` | `string` |
| `actionFunc` | `HeaderActionType` |

#### Returns

`void`

#### Deprecated

Registry.registerDetailsViewHeaderAction is deprecated. Please use registerDetailsViewHeaderAction.

#### Defined in

[src/plugin/registry.tsx:205](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L205)

***

### ~~registerDetailsViewSection()~~

```ts
registerDetailsViewSection(sectionName: string, sectionFunc: (resource: KubeObject<any>) => null | SectionFuncProps): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sectionName` | `string` |
| `sectionFunc` | (`resource`: [`KubeObject`](../../../lib/k8s/KubeObject/classes/KubeObject.md)\<`any`\>) => `null` \| [`SectionFuncProps`](../interfaces/SectionFuncProps.md) |

#### Returns

`void`

#### Deprecated

Registry.registerDetailsViewSection is deprecated. Please use registerDetailsViewSection.

```tsx

register.registerDetailsViewSection('biolatency', resource => {
  if (resource?.kind === 'Node') {
    return {
      title: 'Block I/O Latency',
      component: () => <CustomComponent />,
    };
  }
  return null;
});

```

#### Defined in

[src/plugin/registry.tsx:237](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L237)

***

### ~~registerRoute()~~

```ts
registerRoute(routeSpec: Route): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `routeSpec` | `Route` |

#### Returns

`void`

#### Deprecated

Registry.registerRoute is deprecated. Please use registerRoute.

#### Defined in

[src/plugin/registry.tsx:197](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L197)

***

### ~~registerSidebarItem()~~

```ts
registerSidebarItem(
   parentName: null | string, 
   itemName: string, 
   itemLabel: string, 
   url: string, 
   opts: Pick<SidebarEntryProps, "icon" | "sidebar" | "useClusterURL">): void
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `parentName` | `null` \| `string` |
| `itemName` | `string` |
| `itemLabel` | `string` |
| `url` | `string` |
| `opts` | `Pick`\<[`SidebarEntryProps`](../interfaces/SidebarEntryProps.md), `"icon"` \| `"sidebar"` \| `"useClusterURL"`\> |

#### Returns

`void`

#### Deprecated

Registry.registerSidebarItem is deprecated. Please use registerSidebarItem.

#### Defined in

[src/plugin/registry.tsx:173](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L173)
