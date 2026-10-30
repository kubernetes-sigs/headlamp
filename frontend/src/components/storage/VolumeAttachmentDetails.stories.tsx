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

import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import type { KubeVolumeAttachment } from '../../lib/k8s/volumeAttachment';
import { API_BASE, TestContext } from '../../test';
import {
  BASE_VOLUME_ATTACHMENT,
  VOLUME_ATTACHMENT_ATTACH_ERROR,
  VOLUME_ATTACHMENT_DETACH_ERROR,
} from './storyHelper';
import Details from './VolumeAttachmentDetails';

export default {
  title: 'VolumeAttachment/DetailsView',
  component: Details,
  argTypes: {},
} as Meta;

function makeStory(attachment: KubeVolumeAttachment) {
  const name = attachment.metadata.name;
  const Template: StoryFn = () => <Details />;
  const story = Template.bind({});
  story.decorators = [
    Story => (
      <TestContext routerMap={{ name }}>
        <Story />
      </TestContext>
    ),
  ];
  story.parameters = {
    msw: {
      handlers: {
        story: [
          http.get(`${API_BASE}/apis/storage.k8s.io/v1/volumeattachments/${name}`, () =>
            HttpResponse.json(attachment)
          ),
          http.get(`${API_BASE}/apis/storage.k8s.io/v1/volumeattachments`, () =>
            HttpResponse.error()
          ),
          http.get(`${API_BASE}/api/v1/events`, () =>
            HttpResponse.json({
              kind: 'EventList',
              items: [],
              metadata: {},
            })
          ),
        ],
      },
    },
  };
  return story;
}

export const Base = makeStory(BASE_VOLUME_ATTACHMENT);

export const AttachError = makeStory(VOLUME_ATTACHMENT_ATTACH_ERROR);

export const DetachError = makeStory(VOLUME_ATTACHMENT_DETACH_ERROR);
