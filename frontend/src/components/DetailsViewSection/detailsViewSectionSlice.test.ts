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
import detailsViewSectionReducer, {
  addDetailsViewSectionsProcessor,
  DefaultDetailsViewSection,
  DetailsViewSection,
  DetailsViewsSectionProcessor,
  setDetailsView,
  setDetailsViewSection,
} from './detailsViewSectionSlice';

describe('detailsViewSectionSlice', () => {
  let store = configureStore({
    reducer: {
      detailsViewSection: detailsViewSectionReducer,
    },
  });

  beforeEach(() => {
    store = configureStore({
      reducer: {
        detailsViewSection: detailsViewSectionReducer,
      },
    });
  });

  describe('setDetailsView', () => {
    it('should add a new details view', () => {
      store.dispatch(setDetailsView(DefaultDetailsViewSection.METADATA));
      expect(store.getState().detailsViewSection.detailViews).toEqual([
        DefaultDetailsViewSection.METADATA,
      ]);
    });
  });

  describe('setDetailsViewSection', () => {
    it('should generate an ID if not provided and payload is a section type', () => {
      const section = DefaultDetailsViewSection.METADATA;
      store.dispatch(setDetailsViewSection(section));
      const savedSection = store.getState().detailsViewSection.detailsViewSections[0];
      expect(savedSection.id).toMatch(/^generated-id-/);
      expect(savedSection.section).toEqual(DefaultDetailsViewSection.METADATA);
    });

    it('should generate an ID if not provided and payload is an object with a section', () => {
      // @ts-ignore because we are testing the case where id is missing.
      const section: DetailsViewSection = { section: DefaultDetailsViewSection.METADATA };
      store.dispatch(setDetailsViewSection(section));
      const savedSection = store.getState().detailsViewSection.detailsViewSections[0];
      expect(savedSection.id).toMatch(/^generated-id-/);
      expect(savedSection.section).toEqual(DefaultDetailsViewSection.METADATA);
    });

    it('should not generate an ID if it is already provided', () => {
      const section: DetailsViewSection = {
        id: 'test-id',
        section: DefaultDetailsViewSection.METADATA,
      };
      store.dispatch(setDetailsViewSection(section));
      const savedSection = store.getState().detailsViewSection.detailsViewSections[0];
      expect(savedSection.id).toEqual('test-id');
      expect(savedSection.section).toEqual(DefaultDetailsViewSection.METADATA);
    });
  });

  describe('addDetailsViewSectionsProcessor', () => {
    it('should add a new details view sections processor when provided as an object', () => {
      const processor: DetailsViewsSectionProcessor = {
        id: 'test-processor',
        processor: () => [{ id: 'test-section' }],
      };
      store.dispatch(addDetailsViewSectionsProcessor(processor));
      expect(store.getState().detailsViewSection.detailsViewSectionsProcessors).toEqual([
        processor,
      ]);
    });

    it('should add a new details view sections processor when provided as a function', () => {
      const processorFunc = () => [{ id: 'test-section' }];
      store.dispatch(addDetailsViewSectionsProcessor(processorFunc));
      const processors = store.getState().detailsViewSection.detailsViewSectionsProcessors;
      expect(processors).toHaveLength(1);
      expect(processors[0].processor).toBe(processorFunc);
      expect(processors[0].id).toMatch(/^generated-id-/);
    });
  });
});
