/*
 * Copyright 2026 The Kubernetes Authors
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

import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { expect, within } from 'storybook/test';
import { API_BASE, TestContext } from '../../test';
import IPAddressDetails from './Details';
import {
  allowsActions,
  collection,
  collectionUrl,
  externalAddress,
  serviceAddress,
} from './storyHelper';

const meta = {
  title: 'IPAddress/Details',
  component: IPAddressDetails,
  args: { name: serviceAddress.metadata.name, cluster: 'main' },
  decorators: [
    (Story, { args }) => (
      <TestContext routerMap={{ cluster: 'main', name: args.name! }} urlPrefix="/c">
        <Story />
      </TestContext>
    ),
  ],
} satisfies Meta<typeof IPAddressDetails>;
export default meta;

type Story = StoryObj<typeof meta>;

const detailsUrl = (name: string) => `${collectionUrl}/${name}`;
const crdCollectionUrl = `${API_BASE}/clusters/main/apis/apiextensions.k8s.io/v1/customresourcedefinitions`;
const parentCRD = 'services.networking.example.com';
const parentCRDUrl = `${crdCollectionUrl}/${parentCRD}`;

function handlersFor(
  address: typeof serviceAddress,
  ...parentHandlers: ReturnType<typeof http.get>[]
) {
  return {
    handlers: {
      story: [
        allowsActions,
        collection,
        http.get(`${collectionUrl}/:name`, ({ params }) =>
          params.name === address.metadata.name
            ? HttpResponse.json(address)
            : HttpResponse.json({ message: 'IPAddress not found' }, { status: 404 })
        ),
        ...parentHandlers,
      ],
    },
  };
}

export const Service: Story = {
  parameters: {
    msw: handlersFor(serviceAddress),
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        expect(screen.getByText('Core API Group')).toBeVisible();
        expect(screen.getByText('services')).toBeVisible();
        expect(screen.getByText('kube-system')).toBeVisible();
        expect(screen.getByRole('link', { name: 'kube-dns' })).toHaveAttribute(
          'href',
          '/c/main/services/kube-system/kube-dns'
        );
      },
    },
  },
};

export const ExternalParent: Story = {
  args: { name: externalAddress.metadata.name },
  parameters: {
    msw: handlersFor(
      externalAddress,
      http.get(parentCRDUrl, () => HttpResponse.json({ message: 'Not found' }, { status: 404 }))
    ),
    storyshots: {
      waitForState: () => {
        const screen = within(document.body);
        expect(screen.getByText('networking.example.com')).toBeVisible();
        expect(screen.getByText('external-service')).toBeVisible();
        expect(screen.queryByRole('link', { name: 'external-service' })).toBeNull();
      },
    },
  },
};

export const CustomParent: Story = {
  args: { name: externalAddress.metadata.name },
  parameters: {
    msw: handlersFor(
      externalAddress,
      http.get(parentCRDUrl, () =>
        HttpResponse.json({
          apiVersion: 'apiextensions.k8s.io/v1',
          kind: 'CustomResourceDefinition',
          metadata: { name: parentCRD, resourceVersion: '1' },
          spec: {
            group: 'networking.example.com',
            scope: 'Namespaced',
            names: { kind: 'Service', plural: 'services' },
            versions: [{ name: 'v1', served: true, storage: true }],
          },
        })
      ),
      http.get(crdCollectionUrl, () =>
        HttpResponse.json({ kind: 'CustomResourceDefinitionList', metadata: {}, items: [] })
      )
    ),
    storyshots: {
      waitForState: () => {
        expect(
          within(document.body).getByRole('link', { name: 'external-service' })
        ).toHaveAttribute(
          'href',
          '/c/main/customresources/services.networking.example.com/default/external-service'
        );
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    storyshots: { disable: true },
    msw: {
      handlers: {
        story: [
          allowsActions,
          collection,
          http.get(detailsUrl(serviceAddress.metadata.name), () => new Promise(() => {})),
        ],
      },
    },
  },
};

export const Error: Story = {
  parameters: {
    msw: {
      handlers: {
        story: [
          allowsActions,
          collection,
          http.get(detailsUrl(serviceAddress.metadata.name), () => HttpResponse.error()),
        ],
      },
    },
  },
};
