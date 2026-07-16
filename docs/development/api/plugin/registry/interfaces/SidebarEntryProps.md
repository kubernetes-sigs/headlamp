# Interface: SidebarEntryProps

Defined in: [components/Sidebar/sidebarSlice.ts:31](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L31)

Represents an entry in the sidebar menu.

## Properties

### entryType?

```ts
optional entryType?: "link" | "subheader";
```

Defined in: [components/Sidebar/sidebarSlice.ts:68](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L68)

The type of sidebar entry to render. Defaults to a clickable link item.

***

### icon?

```ts
optional icon?: string | IconifyIcon;
```

Defined in: [components/Sidebar/sidebarSlice.ts:61](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L61)

An iconify string or icon object that will be used for the sidebar's icon

#### See

https://icon-sets.iconify.design/mdi/ for icons.

***

### label

```ts
label: string;
```

Defined in: [components/Sidebar/sidebarSlice.ts:43](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L43)

Label to display.

***

### name

```ts
name: string;
```

Defined in: [components/Sidebar/sidebarSlice.ts:35](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L35)

Name of this SidebarItem.

***

### parent?

```ts
optional parent?: string | null;
```

Defined in: [components/Sidebar/sidebarSlice.ts:47](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L47)

Name of the parent SidebarEntry.

***

### sidebar?

```ts
optional sidebar?: string;
```

Defined in: [components/Sidebar/sidebarSlice.ts:64](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L64)

The sidebar to display this item in. If not specified, it will be displayed in the default sidebar.

***

### subtitle?

```ts
optional subtitle?: ReactNode;
```

Defined in: [components/Sidebar/sidebarSlice.ts:39](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L39)

Text to display under the name.

***

### sx?

```ts
optional sx?: SxProps<Theme>;
```

Defined in: [components/Sidebar/sidebarSlice.ts:72](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L72)

Custom style overrides for subheader entries.

***

### url?

```ts
optional url?: string;
```

Defined in: [components/Sidebar/sidebarSlice.ts:51](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L51)

URL to go to when this item is followed.

***

### useClusterURL?

```ts
optional useClusterURL?: boolean;
```

Defined in: [components/Sidebar/sidebarSlice.ts:55](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/components/Sidebar/sidebarSlice.ts#L55)

Should URL have the cluster prefix? (default=true)
