[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / Registry

# Class: Registry

[plugin/registry](../modules/plugin_registry.md).Registry

## Constructors

### constructor

• **new Registry**()

## Methods

### registerAppBarAction

▸ **registerAppBarAction**(`actionName`, `actionFunc`): `void`

**`deprecated`** Registry.registerAppBarAction is deprecated. Please use registerAppBarAction.

#### Parameters

| Name | Type |
| :------ | :------ |
| `actionName` | `string` |
| `actionFunc` | (...`args`: `any`[]) => ``null`` \| `Element` |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:164](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L164)

___

### registerAppLogo

▸ **registerAppLogo**(`logo`): `void`

**`deprecated`** Registry.registerAppLogo is deprecated. Please use registerAppLogo.

#### Parameters

| Name | Type |
| :------ | :------ |
| `logo` | [`AppLogoType`](../modules/plugin_registry.md#applogotype) |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:213](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L213)

___

### registerClusterChooserComponent

▸ **registerClusterChooserComponent**(`component`): `void`

**`deprecated`** Registry.registerClusterChooserComponent is deprecated. Please use registerClusterChooser.

#### Parameters

| Name | Type |
| :------ | :------ |
| `component` | ``null`` \| `ComponentType`<[`ClusterChooserProps`](../interfaces/plugin_registry.ClusterChooserProps.md)\> |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:221](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L221)

___

### registerDetailsViewHeaderAction

▸ **registerDetailsViewHeaderAction**(`actionName`, `actionFunc`): `void`

**`deprecated`** Registry.registerDetailsViewHeaderAction is deprecated. Please use registerDetailsViewHeaderAction.

#### Parameters

| Name | Type |
| :------ | :------ |
| `actionName` | `string` |
| `actionFunc` | `HeaderActionType` |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:154](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L154)

___

### registerDetailsViewSection

▸ **registerDetailsViewSection**(`sectionName`, `sectionFunc`): `void`

**`deprecated`** Registry.registerDetailsViewSection is deprecated. Please use registerDetailsViewSection.

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

#### Parameters

| Name | Type |
| :------ | :------ |
| `sectionName` | `string` |
| `sectionFunc` | (`props`: { `resource`: `any`  }) => ``null`` \| [`SectionFuncProps`](../interfaces/plugin_registry.SectionFuncProps.md) |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:186](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L186)

___

### registerRoute

▸ **registerRoute**(`routeSpec`): `void`

**`deprecated`** Registry.registerRoute is deprecated. Please use registerRoute.

#### Parameters

| Name | Type |
| :------ | :------ |
| `routeSpec` | [`Route`](../interfaces/lib_router.Route.md) |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:146](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L146)

___

### registerSidebarItem

▸ **registerSidebarItem**(`parentName`, `itemName`, `itemLabel`, `url`, `opts?`): `void`

**`deprecated`** Registry.registerSidebarItem is deprecated. Please use registerSidebarItem.

#### Parameters

| Name | Type |
| :------ | :------ |
| `parentName` | ``null`` \| `string` |
| `itemName` | `string` |
| `itemLabel` | `string` |
| `url` | `string` |
| `opts` | `Pick`<[`SidebarEntryProps`](../interfaces/plugin_registry.SidebarEntryProps.md), ``"sidebar"`` \| ``"useClusterURL"`` \| ``"icon"``\> |

#### Returns

`void`

#### Defined in

[plugin/registry.tsx:122](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/plugin/registry.tsx#L122)
