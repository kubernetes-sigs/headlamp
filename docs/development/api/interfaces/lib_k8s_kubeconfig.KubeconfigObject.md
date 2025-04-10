[API](../API.md) / [lib/k8s/kubeconfig](../modules/lib_k8s_kubeconfig.md) / KubeconfigObject

# Interface: KubeconfigObject

[lib/k8s/kubeconfig](../modules/lib_k8s_kubeconfig.md).KubeconfigObject

KubeconfigObject is the object that is stored in indexDB as string format.
It is a JSON encoded version of the kubeconfig file.
It is used to store the kubeconfig for stateless clusters.
This is basically a k8s client - go Kubeconfig object.
KubeconfigObject holds the information needed to build connect to remote kubernetes clusters as a given user
* @see [more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/)

**`see`** storeStatelessClusterKubeconfig

**`see`** getStatelessClusterKubeConfigs

**`see`** findKubeconfigByClusterName

## Properties

### apiVersion

• **apiVersion**: `string`

version of the kubeconfig file.

#### Defined in

[lib/k8s/kubeconfig.ts:14](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/kubeconfig.ts#L14)

___

### clusters

• **clusters**: { `cluster`: { `certificateAuthority?`: `string` ; `certificateAuthorityData?`: `string` ; `disableCompression?`: `boolean` ; `extensions?`: { `extension`: {} ; `name`: `string`  }[] ; `insecureSkipTLSVerify?`: `boolean` ; `proxyURL?`: `string` ; `server`: `string` ; `tlsServerName?`: `string`  } ; `name`: `string`  }[]

Clusters is a map of referencable names to cluster configs.

**`see`** [more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedCluster)

#### Defined in

[lib/k8s/kubeconfig.ts:34](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/kubeconfig.ts#L34)

___

### contexts

• **contexts**: { `context`: { `cluster`: `string` ; `extensions?`: { `extension`: { `customName?`: `string`  } ; `name`: `string`  }[] ; `namespace?`: `string` ; `user`: `string`  } ; `name`: `string`  }[]

Contexts is a map of referencable names to context configs.

**`see`** [more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedContext)

#### Defined in

[lib/k8s/kubeconfig.ts:130](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/kubeconfig.ts#L130)

___

### current-context

• **current-context**: `string`

CurrentContext is the name of the context that you would like to use by default

#### Defined in

[lib/k8s/kubeconfig.ts:154](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/kubeconfig.ts#L154)

___

### extensions

• `Optional` **extensions**: { `extension`: {} ; `name`: `string`  }[]

Extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields

**`see`** [more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedExtension)

#### Defined in

[lib/k8s/kubeconfig.ts:158](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/kubeconfig.ts#L158)

___

### kind

• **kind**: `string`

kind is the type of the kubeconfig file. It is always 'Config'.

#### Defined in

[lib/k8s/kubeconfig.ts:16](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/kubeconfig.ts#L16)

___

### preferences

• `Optional` **preferences**: `Object`

Preferences holds general information to be use for cli interactions

**`see`** [more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#Preferences)

#### Type declaration

| Name | Type | Description |
| :------ | :------ | :------ |
| `colors?` | `boolean` | colors specifies whether output should use colors. |
| `extensions?` | { `extension`: {} ; `name`: `string`  }[] | extensions holds additional information. This is useful for extenders so that reads and writes don't clobber unknown fields on the Preferences object. |

#### Defined in

[lib/k8s/kubeconfig.ts:20](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/kubeconfig.ts#L20)

___

### users

• **users**: { `name`: `string` ; `user`: { `authProvider?`: { `config`: { `[key: string]`: `string`;  } ; `name`: `string`  } ; `clientCertificate?`: `string` ; `clientCertificateData?`: `string` ; `clientKey?`: `string` ; `clientKeyData?`: `string` ; `exec?`: { `args?`: `string`[] ; `command`: `string` ; `env?`: { `[key: string]`: `string`;  }  } ; `extensions?`: { `extension`: {} ; `name`: `string`  }[] ; `impersonate?`: `string` ; `impersonateGroups?`: `string`[] ; `impersonateUserExtra?`: { `[key: string]`: `string`[];  } ; `password?`: `string` ; `token?`: `string` ; `tokenFile?`: `string` ; `username?`: `string`  }  }[]

AuthInfos is a map of referencable names to user configs.

**`see`** [more info](https://kubernetes.io/docs/reference/config-api/kubeconfig.v1/#NamedAuthInfo)

#### Defined in

[lib/k8s/kubeconfig.ts:67](https://github.com/kubernetes-sigs/headlamp/blob/072d2509b/frontend/src/lib/k8s/kubeconfig.ts#L67)
