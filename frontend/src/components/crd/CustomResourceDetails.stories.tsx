import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { TestContext } from '../../test';
import { CustomResourceDetails, CustomResourceDetailsProps } from './CustomResourceDetails';
import { mockCRD, mockCRList } from './storyHelper';

export default {
  title: 'crd/CustomResourceDetails',
  component: CustomResourceDetails,
  argTypes: {},
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions',
            () => HttpResponse.error()
          ),
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
            () => HttpResponse.json({})
          ),
          http.get(
            'http://localhost:4466/apis/my.phonyresources.io/v1/namespaces/mynamespace/mycustomresources/mycustomresource',
            () => HttpResponse.json(mockCRList[0])
          ),
          http.get('http://localhost:4466/apis/my.phonyresources.io/v1/mycustomresources', () =>
            HttpResponse.json({})
          ),
          http.get(
            'http://localhost:4466/apis/my.phonyresources.io/v1/mycustomresources/nonexistentcustomresource',
            () => HttpResponse.error()
          ),
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions/error.crd.io',
            () => HttpResponse.error()
          ),
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions/mydefinition.phonyresources.io',
            () => HttpResponse.json(mockCRD)
          ),
          http.get('http://localhost:4466/api/v1/namespaces/mynamespace/events', () =>
            HttpResponse.error()
          ),
          http.get(
            'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions/loadingcrd',
            () => HttpResponse.json(null)
          ),
        ],
      },
    },
  },
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn<CustomResourceDetailsProps> = args => <CustomResourceDetails {...args} />;

export const NoError = Template.bind({});
NoError.args = {
  crName: 'mycustomresource',
  crd: 'mydefinition.phonyresources.io',
  namespace: 'mynamespace',
};

export const ErrorGettingCRD = Template.bind({});
ErrorGettingCRD.args = {
  crName: 'doesnotmatter',
  crd: 'error.crd.io',
  namespace: '-',
};

export const ErrorGettingCR = Template.bind({});
ErrorGettingCR.args = {
  crName: 'nonexistentcustomresource',
  crd: 'mydefinition.phonyresources.io',
  namespace: '-',
};
