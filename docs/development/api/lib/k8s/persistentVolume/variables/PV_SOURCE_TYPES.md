# Variable: PV\_SOURCE\_TYPES

```ts
const PV_SOURCE_TYPES: readonly ["csi", "hostPath", "nfs", "local", "iscsi", "cephfs", "rbd", "glusterfs", "awsElasticBlockStore", "gcePersistentDisk", "azureDisk", "azureFile", "fc", "flexVolume", "flocker", "photonPersistentDisk", "portworxVolume", "scaleIO", "storageos", "vsphereVolume"];
```

Defined in: [lib/k8s/persistentVolume.ts:33](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/lib/k8s/persistentVolume.ts#L33)

Volume source keys recognized on a PersistentVolume spec, in the order they should be reported.

## See

[https://kubernetes.io/docs/concepts/storage/persistent-volumes/#types-of-persistent-volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#types-of-persistent-volumes)
