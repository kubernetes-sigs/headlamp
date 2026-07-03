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
import Event from '../../lib/k8s/event';
import Node from '../../lib/k8s/node';
import { TestContext } from '../../test';
import { AKS_UPGRADE_EVENTS, AKS_UPGRADE_NODES } from './storyHelper';
import { UpgradeProgress } from './UpgradeVisualizationPanel';

// The top-level UpgradeVisualizationPanel gates on AKS detection then fetches
// upgrade events; UpgradeProgress is the pure renderer it ends up showing, so
// the stories drive it directly with the nodes and events as fixtures.
const nodes = AKS_UPGRADE_NODES.map(data => new Node(data));
const events = AKS_UPGRADE_EVENTS.map(data => new Event(data));

export default {
  title: 'node/UpgradeVisualizationPanel',
  component: UpgradeProgress,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

// An in-progress upgrade: one node mid-upgrade (cordon/drain stepper), one
// surge node, and one idle node.
export const Upgrading: StoryFn = () => <UpgradeProgress nodes={nodes} nodeEvents={events} />;

// No upgrade events: every node renders as idle.
export const AllIdle: StoryFn = () => <UpgradeProgress nodes={nodes} nodeEvents={[]} />;
