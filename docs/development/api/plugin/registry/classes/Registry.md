# Class: Registry

Defined in: [plugin/registry.tsx:177](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L177)

## Constructors

### Constructor

```ts
new Registry(): Registry;
```

#### Returns

`Registry`

## Methods

### ~~registerAppBarAction()~~

```ts
registerAppBarAction(actionName: string, actionFunc: (...args: any[]) => ReactNode): void;
```

Defined in: [plugin/registry.tsx:223](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L223)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `actionName` | `string` |
| `actionFunc` | (...`args`: `any`[]) => `ReactNode` |

#### Returns

`void`

#### Deprecated

Registry.registerAppBarAction is deprecated. Please use registerAppBarAction.

***

### ~~registerAppLogo()~~

```ts
registerAppLogo(logo: AppLogoType): void;
```

Defined in: [plugin/registry.tsx:272](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L272)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `logo` | [`AppLogoType`](../type-aliases/AppLogoType.md) |

#### Returns

`void`

#### Deprecated

Registry.registerAppLogo is deprecated. Please use registerAppLogo.

***

### ~~registerClusterChooserComponent()~~

```ts
registerClusterChooserComponent(component: 
  | ComponentType<ClusterChooserProps>
  | null): void;
```

Defined in: [plugin/registry.tsx:280](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L280)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `component` | \| `ComponentType`\<[`ClusterChooserProps`](../interfaces/ClusterChooserProps.md)\> \| `null` |

#### Returns

`void`

#### Deprecated

Registry.registerClusterChooserComponent is deprecated. Please use registerClusterChooser.

***

### ~~registerDetailsViewHeaderAction()~~

```ts
registerDetailsViewHeaderAction(actionName: string, actionFunc: HeaderActionType): void;
```

Defined in: [plugin/registry.tsx:213](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L213)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `actionName` | `string` |
| `actionFunc` | `HeaderActionType` |

#### Returns

`void`

#### Deprecated

Registry.registerDetailsViewHeaderAction is deprecated. Please use registerDetailsViewHeaderAction.

***

### ~~registerDetailsViewSection()~~

```ts
registerDetailsViewSection(sectionName: string, sectionFunc: (resource: KubeObject) => SectionFuncProps | null): void;
```

Defined in: [plugin/registry.tsx:245](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L245)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sectionName` | `string` |
| `sectionFunc` | (`resource`: [`KubeObject`](../../../lib/k8s/KubeObject/classes/KubeObject.md)) => [`SectionFuncProps`](../interfaces/SectionFuncProps.md) \| `null` |

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

***

### ~~registerRoute()~~

```ts
registerRoute(routeSpec: Route): void;
```

Defined in: [plugin/registry.tsx:205](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L205)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `routeSpec` | `Route` |

#### Returns

`void`

#### Deprecated

Registry.registerRoute is deprecated. Please use registerRoute.

***

### ~~registerSidebarItem()~~

```ts
registerSidebarItem(
   parentName: string | null, 
   itemName: string, 
   itemLabel: string, 
   url: string, 
   opts?: Pick<SidebarEntryProps, "sidebar" | "useClusterURL" | "icon">): void;
```

Defined in: [plugin/registry.tsx:181](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L181)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `parentName` | `string` \| `null` |
| `itemName` | `string` |
| `itemLabel` | `string` |
| `url` | `string` |
| `opts` | `Pick`\<[`SidebarEntryProps`](../interfaces/SidebarEntryProps.md), `"sidebar"` \| `"useClusterURL"` \| `"icon"`\> |

#### Returns

`void`

#### Deprecated

Registry.registerSidebarItem is deprecated. Please use registerSidebarItem.
