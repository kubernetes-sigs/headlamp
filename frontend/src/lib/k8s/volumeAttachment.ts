/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface KubeVolumeAttachment extends KubeObjectInterface {
  spec: {
    attacher: string;
    nodeName: string;
    source: {
      persistentVolumeName?: string;
      inlineVolumeSpec?: object;
    };
  };
  status?: {
    attached: boolean;
    attachError?: {
      message?: string;
      time?: string;
    };
    detachError?: {
      message?: string;
      time?: string;
    };
  };
}

class VolumeAttachment extends KubeObject<KubeVolumeAttachment> {
  static kind = 'VolumeAttachment';
  static apiName = 'volumeattachments';
  static apiVersion = 'storage.k8s.io/v1';
  static isNamespaced = false;

  static getBaseObject(): KubeVolumeAttachment {
    const baseObject = super.getBaseObject() as KubeVolumeAttachment;
    baseObject.spec = {
      attacher: '',
      nodeName: '',
      source: {},
    };
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  get attacher() {
    return this.jsonData.spec?.attacher;
  }

  get nodeName() {
    return this.jsonData.spec?.nodeName;
  }

  get isAttached(): boolean {
    return this.jsonData.status?.attached ?? false;
  }

  static get listRoute() {
    return 'volumeAttachments';
  }

  static get pluralName() {
    return 'volumeattachments';
  }
}

export default VolumeAttachment;
