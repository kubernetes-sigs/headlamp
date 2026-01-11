# Interface: SidebarEntryProps

Represents an entry in the sidebar menu.

## Properties

### icon?

```ts
optional icon: string | IconifyIcon;
```

An iconify string or icon object that will be used for the sidebar's icon

#### See

https://icon-sets.iconify.design/mdi/ for icons.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:58](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/Sidebar/sidebarSlice.ts#L58)

***

### label

```ts
label: string;
```

Label to display.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:40](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/Sidebar/sidebarSlice.ts#L40)

***

### name

```ts
name: string;
```

Name of this SidebarItem.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:32](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/Sidebar/sidebarSlice.ts#L32)

***

### parent?

```ts
optional parent: null | string;
```

Name of the parent SidebarEntry.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:44](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/Sidebar/sidebarSlice.ts#L44)

***

### sidebar?

```ts
optional sidebar: string;
```

The sidebar to display this item in. If not specified, it will be displayed in the default sidebar.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:61](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/Sidebar/sidebarSlice.ts#L61)

***

### subtitle?

```ts
optional subtitle: string;
```

Text to display under the name.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:36](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/Sidebar/sidebarSlice.ts#L36)

***

### url?

```ts
optional url: string;
```

URL to go to when this item is followed.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:48](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/Sidebar/sidebarSlice.ts#L48)

***

### useClusterURL?

```ts
optional useClusterURL: boolean;
```

Should URL have the cluster prefix? (default=true)

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:52](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/Sidebar/sidebarSlice.ts#L52)
