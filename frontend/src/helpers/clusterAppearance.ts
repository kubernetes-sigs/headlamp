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

interface ClusterMetadata {
  extensions?: {
    headlamp_info?: {
      accentColor?: unknown;
      warningBannerText?: unknown;
      icon?: unknown;
    };
  };
}

export interface ClusterAppearance {
  accentColor?: string;
  warningBannerText?: string;
  icon?: string;
}

export function getClusterAppearanceFromMeta(
  metaData: ClusterMetadata | undefined
): ClusterAppearance {
  const headlampInfo = metaData?.extensions?.headlamp_info;
  return {
    accentColor:
      typeof headlampInfo?.accentColor === 'string' ? headlampInfo.accentColor : undefined,
    warningBannerText:
      typeof headlampInfo?.warningBannerText === 'string'
        ? headlampInfo.warningBannerText
        : undefined,
    icon: typeof headlampInfo?.icon === 'string' ? headlampInfo.icon : undefined,
  };
}
