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

import { useTranslation } from 'react-i18next';
import CompositePodGroup from '../../lib/k8s/compositePodGroup';
import PodGroup from '../../lib/k8s/podGroup';
import Link from '../common/Link';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';
import { SchedulingStatus } from '../scheduling/SchedulingStatus';

/**
 * The groups nested directly below a composite group.
 *
 * The API models this the other way around, as a name on the child, and there are no
 * owner references to follow. So the children are found by listing the namespace and
 * keeping the groups that point back at this one.
 * @param parent - The composite group whose children to show.
 * @returns The child composite groups and pod groups of the parent.
 */
function useChildGroups(parent: CompositePodGroup) {
  const listOptions = {
    namespace: parent.metadata.namespace,
    cluster: parent.cluster,
  };
  const { items: composites } = CompositePodGroup.useList(listOptions);
  const { items: podGroups } = PodGroup.useList(listOptions);

  const isChild = (group: CompositePodGroup | PodGroup) =>
    group.parentCompositePodGroupName === parent.metadata.name;

  return {
    childComposites: (composites ?? []).filter(isChild),
    childPodGroups: (podGroups ?? []).filter(isChild),
  };
}

export default function ChildGroupsSection({ parent }: { parent: CompositePodGroup }) {
  const { t } = useTranslation(['glossary', 'translation']);
  const { childComposites, childPodGroups } = useChildGroups(parent);

  return (
    <>
      {childComposites.length > 0 && (
        <SectionBox title={t('glossary|Composite Pod Groups')}>
          <SimpleTable
            columns={[
              {
                label: t('translation|Name'),
                getter: (group: CompositePodGroup) => (
                  <Link kubeObject={group}>{group.metadata.name}</Link>
                ),
              },
              {
                label: t('translation|Policy'),
                getter: (group: CompositePodGroup) => group.policyKind ?? '',
              },
              {
                label: t('translation|Min Group Count'),
                getter: (group: CompositePodGroup) => group.minGroupCount ?? '',
              },
              {
                label: t('translation|Status'),
                getter: (group: CompositePodGroup) => (
                  <SchedulingStatus condition={group.schedulingCondition} />
                ),
              },
            ]}
            data={childComposites}
            reflectInURL="childCompositePodGroups"
          />
        </SectionBox>
      )}
      {childPodGroups.length > 0 && (
        <SectionBox title={t('glossary|Pod Groups')}>
          <SimpleTable
            columns={[
              {
                label: t('translation|Name'),
                getter: (group: PodGroup) => <Link kubeObject={group}>{group.metadata.name}</Link>,
              },
              {
                label: t('translation|Policy'),
                getter: (group: PodGroup) => group.policyKind ?? '',
              },
              {
                label: t('translation|Min Count'),
                getter: (group: PodGroup) => group.minCount ?? '',
              },
              {
                label: t('translation|Status'),
                getter: (group: PodGroup) => (
                  <SchedulingStatus condition={group.schedulingCondition} />
                ),
              },
            ]}
            data={childPodGroups}
            reflectInURL="childPodGroups"
          />
        </SectionBox>
      )}
    </>
  );
}
