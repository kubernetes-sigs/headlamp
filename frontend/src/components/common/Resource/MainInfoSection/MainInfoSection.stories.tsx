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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import Pod from '../../../../lib/k8s/pod';
import {
  NewHeaderActionType,
  removeDetailsViewHeaderAction,
  setDetailsViewHeaderAction,
} from '../../../../redux/actionButtonsSlice';
import reducers from '../../../../redux/reducers/reducers';
import { TestContext } from '../../../../test';
import { podList } from '../../../pod/storyHelper';
import { MainInfoSection, MainInfoSectionProps } from './MainInfoSection';

const resource = new Pod(podList[0]);

export default {
  title: 'Resource/MainInfoSection',
  component: MainInfoSection,
  argTypes: {},
} as Meta;

const Template: StoryFn<MainInfoSectionProps> = (args: MainInfoSectionProps) => (
  <TestContext>
    <MainInfoSection {...args} />
  </TestContext>
);

export const Normal = Template.bind({});
Normal.args = {
  resource,
  title: 'Simple Resource',
};

export const NullBacklink = Template.bind({});
NullBacklink.args = {
  resource,
  backLink: null,
  title: 'No Back Link Resource',
};

export const PluginActions = () => {
  const store = configureStore({ reducer: reducers });
  const Inner = () => {
    const dispatch = useDispatch();

    useEffect(() => {
      // 1. Legacy action (returning arbitrary HTML)
      const LegacyAction = () => {
        const [clicked, setClicked] = useState(false);
        return (
          <button
            style={{ border: '2px solid red', padding: '4px' }}
            onClick={() => setClicked(true)}
          >
            {clicked ? 'Clicked' : 'Legacy Action'}
          </button>
        );
      };

      // 2. Modern action (returning standard ActionButtonProps)
      const ModernAction: NewHeaderActionType = () => ({
        icon: 'mdi:puzzle',
        description: 'Modern Action',
        onClick: () => {},
      });

      // Register them via redux to simulate a plugin
      dispatch(
        setDetailsViewHeaderAction({
          id: 'legacy-action',
          action: LegacyAction,
          isLegacy: true,
        })
      );
      dispatch(
        setDetailsViewHeaderAction({
          id: 'modern-action',
          action: ModernAction,
          isLegacy: false,
        })
      );

      return () => {
        dispatch(removeDetailsViewHeaderAction('legacy-action'));
        dispatch(removeDetailsViewHeaderAction('modern-action'));
      };
    }, [dispatch]);

    return <MainInfoSection resource={resource} title="Plugin Actions Example" />;
  };

  return (
    <TestContext store={store}>
      <Inner />
    </TestContext>
  );
};
