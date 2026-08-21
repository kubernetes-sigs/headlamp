# Interface: CreateResourceEvent

Defined in: [redux/headlampEventSlice.ts:288](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L288)

Event fired when creating a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:290](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L290)

#### status

```ts
status: CONFIRMED;
```

What exactly this event represents. 'CONFIRMED' when the user chooses to apply the new resource.
For now only 'CONFIRMED' is sent.

***

### type

```ts
type: CREATE_RESOURCE;
```

Defined in: [redux/headlampEventSlice.ts:289](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/redux/headlampEventSlice.ts#L289)
