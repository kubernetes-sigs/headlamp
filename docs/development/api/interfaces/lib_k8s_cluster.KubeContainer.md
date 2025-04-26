[API](../API.md) / [lib/k8s/cluster](../modules/lib_k8s_cluster.md) / KubeContainer

# Interface: KubeContainer

[lib/k8s/cluster](../modules/lib_k8s_cluster.md).KubeContainer

**`link`** https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#container-v1-core

## Properties

### args

• `Optional` **args**: `string`[]

Arguments to the entrypoint. The container image's CMD is used if this is not provided.
Variable references $(VAR_NAME) are expanded using the container's environment.
If a variable cannot be resolved, the reference in the input string will be unchanged.
Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME)
syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
Escaped references will never be expanded, regardless of whether the variable exists or not.
Cannot be updated.

**`see`** [more information](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell)

#### Defined in

[lib/k8s/cluster.ts:919](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L919)

___

### command

• `Optional` **command**: `string`[]

Entrypoint array. Not executed within a shell. The container image's ENTRYPOINT is used if
this is not provided. Variable references $(VAR_NAME) are expanded using the container's environment.
If a variable cannot be resolved, the reference in the input string will be unchanged.
Double $$ are reduced to a single $, which allows for escaping the $(VAR_NAME)
syntax: i.e. "$$(VAR_NAME)" will produce the string literal "$(VAR_NAME)".
Escaped references will never be expanded, regardless of whether the variable exists or not.
Cannot be updated.

**`see`** [more information](https://kubernetes.io/docs/tasks/inject-data-application/define-command-argument-container/#running-a-command-in-a-shell)

#### Defined in

[lib/k8s/cluster.ts:931](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L931)

___

### env

• `Optional` **env**: { `name`: `string` ; `value?`: `string` ; `valueFrom?`: { `configMapKeyRef?`: { `key`: `string` ; `name`: `string` ; `optional?`: `boolean`  } ; `fieldRef?`: { `apiVersion`: `string` ; `fieldPath`: `string`  } ; `resourceFieldRef?`: { `containerName?`: `string` ; `divisor?`: `string` ; `resource`: `string`  } ; `secretKeyRef?`: { `key`: `string` ; `name`: `string` ; `optional?`: `boolean`  }  }  }[]

List of environment variables to set in the container. Cannot be updated.

#### Defined in

[lib/k8s/cluster.ts:934](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L934)

___

### envFrom

• `Optional` **envFrom**: { `configMapRef?`: { `name`: `string` ; `optional?`: `boolean`  } ; `prefix?`: `string` ; `secretRef?`: { `name`: `string` ; `optional?`: `boolean`  }  }[]

#### Defined in

[lib/k8s/cluster.ts:996](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L996)

___

### image

• **image**: `string`

Container image name. This field is optional to allow higher level config management to
default or override container images in workload controllers like Deployments and StatefulSets.

**`see`** [more info](https://kubernetes.io/docs/concepts/containers/images)

#### Defined in

[lib/k8s/cluster.ts:1020](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1020)

___

### imagePullPolicy

• **imagePullPolicy**: `string`

Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is
specified, or IfNotPresent otherwise. Cannot be updated.

**`see`** [more info](https://kubernetes.io/docs/concepts/containers/images#updating-images)

#### Defined in

[lib/k8s/cluster.ts:1028](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1028)

___

### livenessProbe

• `Optional` **livenessProbe**: [`KubeContainerProbe`](lib_k8s_cluster.KubeContainerProbe.md)

Periodic probe of container liveness. Container will be restarted if the probe fails.
Cannot be updated.

**`see`** [more info](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes)

#### Defined in

[lib/k8s/cluster.ts:1038](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1038)

___

### name

• **name**: `string`

Name of the container specified as a DNS_LABEL.
Each container in a pod must have a unique name (DNS_LABEL).

Cannot be updated.

#### Defined in

[lib/k8s/cluster.ts:1046](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1046)

___

### ports

• `Optional` **ports**: { `containerPort`: `number` ; `hostIP?`: `string` ; `hostPort?`: `number` ; `name?`: `string` ; `protocol?`: `string`  }[]

List of ports to expose from the container. Not specifying a port here DOES NOT prevent that
port from being exposed. Any port which is listening on the default "0.0.0.0" address inside
a container will be accessible from the network. Modifying this array with strategic merge
patch may corrupt the data. For more information See https://github.com/kubernetes/kubernetes/issues/108255.

Cannot be updated.

https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#containerport-v1-core

#### Defined in

[lib/k8s/cluster.ts:1058](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1058)

___

### readinessProbe

• `Optional` **readinessProbe**: [`KubeContainerProbe`](lib_k8s_cluster.KubeContainerProbe.md)

Periodic probe of container service readiness. Container will be removed from service endpoints
if the probe fails.

Cannot be updated.

**`see`** [more info](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle#container-probes)

#### Defined in

[lib/k8s/cluster.ts:1081](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1081)

___

### resizePolicy

• `Optional` **resizePolicy**: { `resourceName`: `string` ; `restartPolicy?`: `string`  }[]

Resources resize policy for the container.

#### Defined in

[lib/k8s/cluster.ts:1083](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1083)

___

### resources

• `Optional` **resources**: `Object`

Compute Resources required by this container. Cannot be updated.

**`see`** [more info](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#resourcerequirements-v1-core

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `claims?` | { `name`: `string`  } | - |
| `claims.name` | `string` | Name must match the name of one entry in pod.spec.resourceClaims of the Pod where this field is used. It makes that resource available inside a container. |
| `limits?` | { `cpu?`: `string` ; `memory?`: `string`  } | Limits describes the maximum amount of compute resources allowed.  **`see`** [more info](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)  Can also have hugpages like: "hugepages-2Mi": "100Mi" // Requesting 100 Mebibytes of 2 MiB HugePages |
| `limits.cpu?` | `string` | example "100m", 100 milliCPU (0.1 CPU core) |
| `limits.memory?` | `string` | example , "256Mi" 256 Mebibytes |
| `requests?` | { `cpu?`: `string` ; `memory?`: `string`  } | - |
| `requests.cpu?` | `string` | example "500m", 500 milliCPU (0.5 CPU core) |
| `requests.memory?` | `string` | example , "1Gi" 1 Gibibyte |

#### Defined in

[lib/k8s/cluster.ts:1102](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1102)

___

### stdin

• `Optional` **stdin**: `boolean`

Whether this container should allocate a buffer for stdin in the container runtime.
If this is not set, reads from stdin in the container will always result in EOF.

Default is false.

#### Defined in

[lib/k8s/cluster.ts:1169](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1169)

___

### stdinOnce

• `Optional` **stdinOnce**: `boolean`

Whether the container runtime should close the stdin channel after it has been opened
by a single attach. When stdin is true the stdin stream will remain open across
multiple attach sessions. If stdinOnce is set to true, stdin is opened on container start,
is empty until the first client attaches to stdin, and then remains open and accepts data
until the client disconnects, at which time stdin is closed and remains closed until the
container is restarted. If this flag is false, a container processes that reads from stdin
will never receive an EOF.

Default is false

#### Defined in

[lib/k8s/cluster.ts:1181](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1181)

___

### terminationMessagePath

• `Optional` **terminationMessagePath**: `string`

Path at which the file to which the container's termination message will be written is mounted
into the container's filesystem. Message written is intended to be brief final status, such as
an assertion failure message. Will be truncated by the node if greater than 4096 bytes.
The total message length across all containers will be limited to 12kb.
Defaults to /dev/termination-log.

Cannot be updated.

#### Defined in

[lib/k8s/cluster.ts:1144](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1144)

___

### terminationMessagePolicy

• `Optional` **terminationMessagePolicy**: `string`

Indicate how the termination message should be populated. File will use the contents of
terminationMessagePath to populate the container status message on both success and failure.
FallbackToLogsOnError will use the last chunk of container log output if the termination message
file is empty and the container exited with an error. The log output is limited to 2048 bytes or
80 lines, whichever is smaller. Defaults to File.

Cannot be updated.

#### Defined in

[lib/k8s/cluster.ts:1155](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1155)

___

### tty

• `Optional` **tty**: `boolean`

Whether this container should allocate a TTY for itself, also requires
'stdin' to be true.

Default is false.

#### Defined in

[lib/k8s/cluster.ts:1188](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1188)

___

### volumeDevices

• `Optional` **volumeDevices**: { `devicePath`: `string` ; `name`: `string`  }[]

volumeDevices is the list of block devices to be used by the container.

patch strategy: merge
patch merge key: devicePath

#### Defined in

[lib/k8s/cluster.ts:1195](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1195)

___

### volumeMounts

• `Optional` **volumeMounts**: { `mountPath`: `string` ; `name`: `string` ; `readOnly`: `boolean`  }[]

#### Defined in

[lib/k8s/cluster.ts:1157](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1157)

___

### workingDir

• `Optional` **workingDir**: `string`

Container's working directory. If not specified, the container runtime's default
will be used, which might be configured in the container image.
Cannot be updated.

#### Defined in

[lib/k8s/cluster.ts:1206](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/cluster.ts#L1206)
