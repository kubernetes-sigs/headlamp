# Variable: LEADER\_WORKER\_SET\_NAME\_LABEL

```ts
const LEADER_WORKER_SET_NAME_LABEL: "leaderworkerset.sigs.k8s.io/name" = 'leaderworkerset.sigs.k8s.io/name';
```

Defined in: [lib/k8s/leaderWorkerSet.ts:28](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/lib/k8s/leaderWorkerSet.ts#L28)

Label the leader worker set controller stamps on every stateful set and pod it
creates for a leader worker set, set to the leader worker set's name. Owner
references can't stand in for it: a group's worker stateful set is owned by
that group's leader pod rather than by the leader worker set.
