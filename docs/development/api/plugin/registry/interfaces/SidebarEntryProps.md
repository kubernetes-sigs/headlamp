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

[src/components/Sidebar/sidebarSlice.ts:59](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/Sidebar/sidebarSlice.ts#L59)

***

### label

```ts
label: string;
```

Label to display.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:41](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/Sidebar/sidebarSlice.ts#L41)

***

### name

```ts
name: string;
```

Name of this SidebarItem.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:33](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/Sidebar/sidebarSlice.ts#L33)

***

### parent?

```ts
optional parent: null | string;
```

Name of the parent SidebarEntry.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:45](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/Sidebar/sidebarSlice.ts#L45)

***

### sidebar?

```ts
optional sidebar: string;
```

The sidebar to display this item in. If not specified, it will be displayed in the default sidebar.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:62](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/Sidebar/sidebarSlice.ts#L62)

***

### subtitle?

```ts
optional subtitle: ReactNode;
```

Text to display under the name.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:37](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/Sidebar/sidebarSlice.ts#L37)

***

### url?

```ts
optional url: string;
```

URL to go to when this item is followed.

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:49](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/Sidebar/sidebarSlice.ts#L49)

***

### useClusterURL?

```ts
optional useClusterURL: boolean;
```

Should URL have the cluster prefix? (default=true)

#### Defined in

[src/components/Sidebar/sidebarSlice.ts:53](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/Sidebar/sidebarSlice.ts#L53)
