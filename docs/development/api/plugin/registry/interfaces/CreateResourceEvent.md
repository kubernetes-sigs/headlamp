# Interface: CreateResourceEvent

Event fired when creating a resource.

## Properties

### data

```ts
data: object;
```

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the user chooses to apply the new resource.
For now only 'CONFIRMED' is sent.

#### Defined in

[src/redux/headlampEventSlice.ts:236](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L236)

***

### type

```ts
type: CREATE_RESOURCE;
```

#### Defined in

[src/redux/headlampEventSlice.ts:235](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/redux/headlampEventSlice.ts#L235)
