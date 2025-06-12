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
import React from 'react';
import { Provider } from 'react-redux';
import { useDispatch } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { makeMockKubeObject } from '../../test/mocker';
import { SectionBox } from '../common/SectionBox';
import DetailsViewSection, { DetailsViewSectionProps } from './DetailsViewSection';
import { setDetailsView } from './detailsViewSectionSlice';

const ourState = {
  detailsViewSection: {
    detailViews: [],
  },
};

export default {
  title: 'DetailsViewSection',
  component: DetailsViewSection,
  decorators: [
    Story => {
      return (
        <MemoryRouter>
          <Provider
            store={configureStore({
              reducer: (state = ourState) => state,
              preloadedState: ourState,
            })}
          >
            <Story />
          </Provider>
        </MemoryRouter>
      );
    },
  ],
} as Meta;

const Template: StoryFn<DetailsViewSectionProps> = args => {
  const dispatch = useDispatch();
  React.useEffect(() => {
    dispatch(
      setDetailsView(resource => {
        if (resource.kind === 'Node') {
          return (
            <SectionBox title={'A title'}>
              I am a custom detail view. <br />
              Made by a {resource.kind} component.
            </SectionBox>
          );
        }
        return null;
      })
    );
  }, []);

  return <DetailsViewSection {...args} />;
};

export const MatchRenderIt = Template.bind({});
MatchRenderIt.args = {
  resource: makeMockKubeObject({ kind: 'Node' }),
};

export const NoMatchNoRender = Template.bind({});
NoMatchNoRender.args = {
  resource: makeMockKubeObject({ kind: 'DoesNotExist' }),
};
