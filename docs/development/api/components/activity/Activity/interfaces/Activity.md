# Interface: Activity

Independent screen or a page rendered on top of the app

## Properties

### cluster?

```ts
optional cluster: string;
```

Cluster of the launched activity

#### Defined in

[src/components/activity/Activity.tsx:88](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L88)

***

### content

```ts
content: ReactNode;
```

Content to display inside the activity

#### Defined in

[src/components/activity/Activity.tsx:71](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L71)

***

### hideTitleInHeader?

```ts
optional hideTitleInHeader: boolean;
```

Hides title from the window header

#### Defined in

[src/components/activity/Activity.tsx:77](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L77)

***

### icon?

```ts
optional icon: ReactNode;
```

Activity icon, optional but highly recommended

#### Defined in

[src/components/activity/Activity.tsx:79](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L79)

***

### id

```ts
id: string;
```

Unique ID

#### Defined in

[src/components/activity/Activity.tsx:69](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L69)

***

### location

```ts
location: ActivityLocation;
```

Current activity location

#### Defined in

[src/components/activity/Activity.tsx:73](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L73)

***

### minimized?

```ts
optional minimized: boolean;
```

Whether this activity is minimized to the taskbar

#### Defined in

[src/components/activity/Activity.tsx:81](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L81)

***

### temporary?

```ts
optional temporary: boolean;
```

Temporary activity will be closed if another activity is opened
It will turn into permanent one if user interacts with it

#### Defined in

[src/components/activity/Activity.tsx:86](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L86)

***

### title?

```ts
optional title: ReactNode;
```

Title to render in the taskbar and in window

#### Defined in

[src/components/activity/Activity.tsx:75](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/components/activity/Activity.tsx#L75)
