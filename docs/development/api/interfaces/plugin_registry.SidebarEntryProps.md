[API](../API.md) / [plugin/registry](../modules/plugin_registry.md) / SidebarEntryProps

# Interface: SidebarEntryProps

[plugin/registry](../modules/plugin_registry.md).SidebarEntryProps

Represents an entry in the sidebar menu.

## Properties

### icon

• `Optional` **icon**: `string` \| `IconifyIcon`

An iconify string or icon object that will be used for the sidebar's icon

**`see`** https://icon-sets.iconify.design/mdi/ for icons.

#### Defined in

[components/Sidebar/sidebarSlice.ts:43](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/Sidebar/sidebarSlice.ts#L43)

___

### label

• **label**: `string`

Label to display.

#### Defined in

[components/Sidebar/sidebarSlice.ts:25](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/Sidebar/sidebarSlice.ts#L25)

___

### name

• **name**: `string`

Name of this SidebarItem.

#### Defined in

[components/Sidebar/sidebarSlice.ts:17](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/Sidebar/sidebarSlice.ts#L17)

___

### parent

• `Optional` **parent**: ``null`` \| `string`

Name of the parent SidebarEntry.

#### Defined in

[components/Sidebar/sidebarSlice.ts:29](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/Sidebar/sidebarSlice.ts#L29)

___

### sidebar

• `Optional` **sidebar**: `string`

The sidebar to display this item in. If not specified, it will be displayed in the default sidebar.

#### Defined in

[components/Sidebar/sidebarSlice.ts:46](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/Sidebar/sidebarSlice.ts#L46)

___

### subtitle

• `Optional` **subtitle**: `string`

Text to display under the name.

#### Defined in

[components/Sidebar/sidebarSlice.ts:21](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/Sidebar/sidebarSlice.ts#L21)

___

### url

• `Optional` **url**: `string`

URL to go to when this item is followed.

#### Defined in

[components/Sidebar/sidebarSlice.ts:33](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/Sidebar/sidebarSlice.ts#L33)

___

### useClusterURL

• `Optional` **useClusterURL**: `boolean`

Should URL have the cluster prefix? (default=true)

#### Defined in

[components/Sidebar/sidebarSlice.ts:37](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/components/Sidebar/sidebarSlice.ts#L37)
