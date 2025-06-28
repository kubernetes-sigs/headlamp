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

import React from 'react';
import uiSlice, { uiSlice as uiSliceObject } from './uiSlice';

const initialState = {
  isVersionDialogOpen: false,
  hideAppBar: false,
  isFullWidth: false,
  functionsToOverride: {},
  panels: [],
};

describe('uiSlice', () => {
  it('should handle initial state', () => {
    expect(uiSlice(undefined, { type: '' })).toEqual(initialState);
  });

  it('should set hideAppBar', () => {
    const nextState = uiSlice(initialState, uiSliceObject.actions.setHideAppBar(true));
    expect(nextState.hideAppBar).toBe(true);
  });

  it('should set isVersionDialogOpen', () => {
    const nextState = uiSlice(initialState, uiSliceObject.actions.setVersionDialogOpen(true));
    expect(nextState.isVersionDialogOpen).toBe(true);
  });

  it('should set isFullWidth', () => {
    const nextState = uiSlice(initialState, uiSliceObject.actions.setIsFullWidth(true));
    expect(nextState.isFullWidth).toBe(true);
  });

  it('should set clusterChooserButtonComponent', () => {
    const testComponent = () => 'test component';
    const nextState = uiSlice(
      initialState,
      uiSliceObject.actions.setClusterChooserButton(testComponent)
    );
    expect(nextState.clusterChooserButtonComponent).toBe(testComponent);
  });

  it('should set functionsToOverride', () => {
    const testSetToken = () => {};
    const testGetToken = () => 'test-token';

    const nextState = uiSlice(
      initialState,
      uiSliceObject.actions.setFunctionsToOverride({
        setToken: testSetToken,
        getToken: testGetToken,
      })
    );

    expect(nextState.functionsToOverride.setToken).toBe(testSetToken);
    expect(nextState.functionsToOverride.getToken).toBe(testGetToken);
  });

  it('should add UI panel', () => {
    const testComponent = () => React.createElement('div');
    const testPanel = {
      id: 'test-panel',
      side: 'left' as const,
      component: testComponent,
    };

    const nextState = uiSlice(initialState, uiSliceObject.actions.addUIPanel(testPanel));

    expect(nextState.panels.length).toBe(1);
    expect(nextState.panels[0]).toEqual(testPanel);
  });

  it('should replace UI panel with same id', () => {
    const testComponent1 = () => React.createElement('div');
    const testPanel1 = {
      id: 'test-panel',
      side: 'left' as const,
      component: testComponent1,
    };

    const stateWithPanel = uiSlice(initialState, uiSliceObject.actions.addUIPanel(testPanel1));

    const testComponent2 = () => React.createElement('span');
    const testPanel2 = {
      id: 'test-panel',
      side: 'right' as const,
      component: testComponent2,
    };

    const finalState = uiSlice(stateWithPanel, uiSliceObject.actions.addUIPanel(testPanel2));

    expect(finalState.panels.length).toBe(1);
    expect(finalState.panels[0]).toEqual(testPanel2);
  });
});
