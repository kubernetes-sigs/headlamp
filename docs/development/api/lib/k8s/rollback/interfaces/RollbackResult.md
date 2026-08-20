# Interface: RollbackResult

Defined in: [lib/k8s/rollback.ts:40](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/rollback.ts#L40)

Result of a rollback operation on a workload resource.

## See

[kubectl rollback implementation](https://github.com/kubernetes/kubectl/blob/master/pkg/polymorphichelpers/rollback.go)

## Properties

### dryRunResult?

```ts
optional dryRunResult?: KubeObjectInterface;
```

Defined in: [lib/k8s/rollback.ts:48](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/rollback.ts#L48)

When dryRun is true, this contains the full resource as it would look
after the rollback, as returned by the API server.

***

### message

```ts
message: string;
```

Defined in: [lib/k8s/rollback.ts:42](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/rollback.ts#L42)

***

### previousRevision?

```ts
optional previousRevision?: number;
```

Defined in: [lib/k8s/rollback.ts:43](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/rollback.ts#L43)

***

### success

```ts
success: boolean;
```

Defined in: [lib/k8s/rollback.ts:41](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/lib/k8s/rollback.ts#L41)
