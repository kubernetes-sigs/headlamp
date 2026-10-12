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

/** What one child section shows, from the list of one kind of group. */
interface ChildSection<T> {
  /** Whether the section is shown at all. */
  visible: boolean;
  /** The children to list, or null while loading or when the list failed. */
  data: T[] | null;
  /** Whether the list failed with nothing to show. */
  hasError: boolean;
}

/**
 * Works out what a child section shows from the list of one kind of group.
 *
 * A failed list returns no items, so an empty result is only read as "no children"
 * when the list succeeded; otherwise a group the user may not list would be shown as
 * a leaf. Children that did load are still shown when the list reports an error.
 * @param list - The list result of one kind of group.
 * @param isChild - Whether a group is nested directly below the parent.
 * @returns What the section shows.
 */
function childSection<T>(
  list: { items: T[] | null; isLoading: boolean; isError: boolean },
  isChild: (group: T) => boolean
): ChildSection<T> {
  const children = (list.items ?? []).filter(isChild);
  const hasError = list.isError && children.length === 0;

  return {
    visible: list.isLoading || hasError || children.length > 0,
    data: list.isLoading || hasError ? null : children,
    hasError,
  };
}

/**
 * The groups nested directly below a composite group.
 *
 * The API models this the other way around, as a name on the child, and there are no
 * owner references to follow. So the children are found by listing the namespace and
 * keeping the groups that point back at this one.
 * @param parent - The composite group whose children to show.
 * @returns What the child composite group and pod group sections show.
 */
function useChildGroups(parent: CompositePodGroup) {
  const listOptions = {
    namespace: parent.metadata.namespace,
    cluster: parent.cluster,
  };
  const composites = CompositePodGroup.useList(listOptions);
  const podGroups = PodGroup.useList(listOptions);

  const isChild = (group: CompositePodGroup | PodGroup) =>
    group.parentCompositePodGroupName === parent.metadata.name;

  return {
    childComposites: childSection(composites, isChild),
    childPodGroups: childSection(podGroups, isChild),
  };
}

export default function ChildGroupsSection({ parent }: { parent: CompositePodGroup }) {
  const { t } = useTranslation(['glossary', 'translation']);
  const { childComposites, childPodGroups } = useChildGroups(parent);
  const errorMessage = t('translation|Unable to list the child groups.');

  return (
    <>
      {childComposites.visible && (
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
            data={childComposites.data}
            errorMessage={childComposites.hasError ? errorMessage : undefined}
            reflectInURL="childCompositePodGroups"
          />
        </SectionBox>
      )}
      {childPodGroups.visible && (
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
            data={childPodGroups.data}
            errorMessage={childPodGroups.hasError ? errorMessage : undefined}
            reflectInURL="childPodGroups"
          />
        </SectionBox>
      )}
    </>
  );
}
