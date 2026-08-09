# Class: Registry

Defined in: [plugin/registry.tsx:179](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L179)

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

Defined in: [plugin/registry.tsx:225](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L225)

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

Defined in: [plugin/registry.tsx:274](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L274)

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

Defined in: [plugin/registry.tsx:282](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L282)

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

Defined in: [plugin/registry.tsx:215](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L215)

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

Defined in: [plugin/registry.tsx:247](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L247)

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

Defined in: [plugin/registry.tsx:207](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L207)

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

Defined in: [plugin/registry.tsx:183](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L183)

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
