# Interface: CreateResourceEvent

Defined in: [redux/headlampEventSlice.ts:268](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L268)

Event fired when creating a resource.

## Properties

### data

```ts
data: object;
```

Defined in: [redux/headlampEventSlice.ts:270](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L270)

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

Defined in: [redux/headlampEventSlice.ts:269](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/redux/headlampEventSlice.ts#L269)
