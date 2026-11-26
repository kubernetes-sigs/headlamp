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
import { API_BASE, TestContext } from '../../test';
import DeviceTaintRuleDetails from './DeviceTaintRuleDetails';
import { DEVICE_TAINT_RULE_DUMMY_DATA } from './storyHelper';

const configuredRule = DEVICE_TAINT_RULE_DUMMY_DATA[0];
const allDevicesRule = DEVICE_TAINT_RULE_DUMMY_DATA[1];
const noDevicesRule = DEVICE_TAINT_RULE_DUMMY_DATA[2];

const collectionUrl = `${API_BASE}/apis/resource.k8s.io/v1/devicetaintrules`;
const detailsUrl = (name: string) => `${collectionUrl}/${name}`;

/** The details view also watches the collection for the object it shows. */
const collectionWatch = http.get(collectionUrl, () => HttpResponse.error());

const emptyEvents = http.get(`${API_BASE}/api/v1/events`, () =>
  HttpResponse.json({
    kind: 'EventList',
    items: [],
    metadata: {},
  })
);

export default {
  title: 'DeviceTaintRule/Details',
  component: DeviceTaintRuleDetails,
  argTypes: {},
} as Meta;

const Template: StoryFn<{ name: string }> = args => {
  return (
    <TestContext routerMap={{ name: args.name }}>
      <DeviceTaintRuleDetails />
    </TestContext>
  );
};

export const Configured = Template.bind({});
Configured.args = { name: configuredRule.metadata.name };
Configured.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(configuredRule.metadata.name), () => HttpResponse.json(configuredRule)),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const MatchesAllDevices = Template.bind({});
MatchesAllDevices.args = { name: allDevicesRule.metadata.name };
MatchesAllDevices.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(allDevicesRule.metadata.name), () => HttpResponse.json(allDevicesRule)),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const MatchesNoDevices = Template.bind({});
MatchesNoDevices.args = { name: noDevicesRule.metadata.name };
MatchesNoDevices.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(noDevicesRule.metadata.name), () => HttpResponse.json(noDevicesRule)),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Loading = Template.bind({});
Loading.args = { name: configuredRule.metadata.name };
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(configuredRule.metadata.name), () => new Promise(() => {})),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};

export const Error = Template.bind({});
Error.args = { name: configuredRule.metadata.name };
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl(configuredRule.metadata.name), () => HttpResponse.error()),
        collectionWatch,
        emptyEvents,
      ],
    },
  },
};
