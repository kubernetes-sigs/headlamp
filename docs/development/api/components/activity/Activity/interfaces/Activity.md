# Interface: Activity

Independent screen or a page rendered on top of the app

## Properties

### cluster?

```ts
optional cluster: string;
```

Cluster of the launched activity

#### Defined in

[src/components/activity/Activity.tsx:74](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L74)

***

### content

```ts
content: ReactNode;
```

Content to display inside the activity

#### Defined in

[src/components/activity/Activity.tsx:57](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L57)

***

### hideTitleInHeader?

```ts
optional hideTitleInHeader: boolean;
```

Hides title from the window header

#### Defined in

[src/components/activity/Activity.tsx:63](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L63)

***

### icon?

```ts
optional icon: ReactNode;
```

Activity icon, optional but highly recommended

#### Defined in

[src/components/activity/Activity.tsx:65](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L65)

***

### id

```ts
id: string;
```

Unique ID

#### Defined in

[src/components/activity/Activity.tsx:55](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L55)

***

### location

```ts
location: ActivityLocation;
```

Current activity location

#### Defined in

[src/components/activity/Activity.tsx:59](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L59)

***

### minimized?

```ts
optional minimized: boolean;
```

Whether this activity is minimized to the taskbar

#### Defined in

[src/components/activity/Activity.tsx:67](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L67)

***

### temporary?

```ts
optional temporary: boolean;
```

Temporary activity will be closed if another activity is opened
It will turn into permanent one if user interacts with it

#### Defined in

[src/components/activity/Activity.tsx:72](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L72)

***

### title?

```ts
optional title: ReactNode;
```

Title to render in the taskbar and in window

#### Defined in

[src/components/activity/Activity.tsx:61](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/components/activity/Activity.tsx#L61)
