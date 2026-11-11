import { Meta, StoryFn } from '@storybook/nextjs';
import { useState } from 'react';
import { userEvent, within } from 'storybook/test';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { OrganizationPicker, OrganizationPickerValue } from '@etabli/src/components/OrganizationPicker';
import { organizationOptions } from '@etabli/src/fixtures/initiative';
import { getTRPCMock } from '@etabli/src/server/mock/trpc';

type ComponentType = typeof OrganizationPicker;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/OrganizationPicker',
  component: OrganizationPicker,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const defaultMswParameters = {
  msw: {
    handlers: [
      getTRPCMock({
        type: 'query' as 'query',
        path: ['listOrganizationChildren'] as ['listOrganizationChildren'],
        response: {
          organizations: organizationOptions.map((organization) => ({ ...organization, hasChildren: false })),
          total: organizationOptions.length,
          pageSize: 50,
          standaloneOrganizationsCount: 12184,
          unclassifiedInitiativesCount: 5277,
        },
      }),
      getTRPCMock({
        type: 'query' as 'query',
        path: ['searchOrganizations'] as ['searchOrganizations'],
        response: {
          organizations: organizationOptions,
          matchedThrough: {},
        },
      }),
      getTRPCMock({
        type: 'query' as 'query',
        path: ['getOrganizations'] as ['getOrganizations'],
        response: {
          organizations: [organizationOptions[0]],
        },
      }),
    ],
  },
};

const Template: StoryFn<ComponentType> = (args) => {
  const [value, setValue] = useState<OrganizationPickerValue>(args.value);

  return (
    <div style={{ maxWidth: 560 }}>
      <OrganizationPicker {...args} value={value} onChange={setValue} />
    </div>
  );
};

const EmptyStory = Template.bind({});
EmptyStory.args = {
  value: { organizationIds: [], unclassified: false },
};
EmptyStory.parameters = { ...defaultMswParameters };
EmptyStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/initiatives non classées/i);
};

export const Empty = prepareStory(EmptyStory);

const WithSelectionStory = Template.bind({});
WithSelectionStory.args = {
  // The DINUM is listed but included through its selected ministry
  value: { organizationIds: [organizationOptions[0].id], unclassified: true },
};
WithSelectionStory.parameters = { ...defaultMswParameters };
WithSelectionStory.play = async ({ canvasElement }) => {
  // Searching lists the DINUM which is included through its selected ministry
  await userEvent.type(await within(canvasElement).findByRole('textbox', { name: /organisations/i }), 'dinum');
  await within(canvasElement).findByText(/incluse via/i, undefined, { timeout: 3000 });
};

export const WithSelection = prepareStory(WithSelectionStory);
