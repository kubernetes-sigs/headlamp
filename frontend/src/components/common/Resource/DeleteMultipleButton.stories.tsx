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

import '../../../i18n/config';
import { Decorator, Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { getTestDate } from '../../../helpers/testHelpers';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { TestContext } from '../../../test';
import DeleteMultipleButton from './DeleteMultipleButton';

export default {
  title: 'Resource/DeleteMultipleButton',
  component: DeleteMultipleButton,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const createMockItem = (name: string, namespace: string = 'default', kind: string = 'ConfigMap') =>
  ({
    metadata: {
      uid: `uid-${name}`,
      name,
      namespace,
      creationTimestamp: getTestDate().toISOString(),
    },
    kind,
    cluster: 'minikube',
    getAuthorization: async () => ({ status: { allowed: true, reason: '' } }),
    delete: async () => undefined,
    _class: () => ({ apiName: kind.toLowerCase() + 's', apiVersion: 'v1', apiGroupName: '', kind }),
  } as unknown as KubeObject);

const Template: StoryFn<typeof DeleteMultipleButton> = args => <DeleteMultipleButton {...args} />;

/** Clicks the button it wraps once rendered, to open the confirmation dialog. */
function OpenDialogOnMount({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.querySelector('button')?.click();
  }, []);
  return <div ref={ref}>{children}</div>;
}

/** Opens the confirmation dialog, so the snapshots cover the items it lists. A play function
 *  would not: storybook.test.tsx runs it before the story's render is committed, which is why
 *  stories with one disable their snapshots. The Docs page is left alone, where an open modal
 *  would cover it. */
const withDialogOpen: Decorator = (Story, context) =>
  context.viewMode === 'docs' ? (
    <Story />
  ) : (
    <OpenDialogOnMount>
      <Story />
    </OpenDialogOnMount>
  );

export const Default = Template.bind({});
Default.args = {
  items: [createMockItem('configmap-1'), createMockItem('configmap-2')],
};
Default.decorators = [withDialogOpen];

export const SingleItem = Template.bind({});
SingleItem.args = {
  items: [createMockItem('configmap-single')],
};
SingleItem.decorators = [withDialogOpen];
