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

import { render, screen } from '@testing-library/react';
import { TestContext } from '../../../test';
import { MainInfoSection } from '../../common/Resource/MainInfoSection/MainInfoSection';
import { DetailsGrid } from '../../common/Resource/Resource';
import { DetailsGridContext } from '../../DetailsViewSection/detailsViewSectionSlice';

class TestResource {
  static apiName = 'test-resources';
  static useGet = () => [null, null];

  get listRoute() {
    return TestResource.apiName;
  }
}

function DetailsPanel() {
  return (
    <>
      <DetailsGrid resourceType={TestResource as any} name="test-resource" backLink="" />
      <MainInfoSection resource={null} backLink="" />
    </>
  );
}

describe('details panel back links', () => {
  it('hides back links on details and custom resource panels', () => {
    render(
      <TestContext>
        <DetailsGridContext.Provider value={{ isInPanel: true }}>
          <DetailsPanel />
        </DetailsGridContext.Provider>
      </TestContext>
    );

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });
});
