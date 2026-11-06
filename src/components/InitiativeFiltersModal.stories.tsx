import Button from '@mui/material/Button';
import { Meta, StoryFn } from '@storybook/react';
import { screen, userEvent, within } from '@storybook/test';
import { useState } from 'react';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { InitiativeFiltersModal, InitiativeFiltersValue, emptyInitiativeFilters } from '@etabli/src/components/InitiativeFiltersModal';
import { organizationOptions } from '@etabli/src/fixtures/initiative';
import { getTRPCMock } from '@etabli/src/server/mock/trpc';

type ComponentType = typeof InitiativeFiltersModal;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/InitiativeFiltersModal',
  component: InitiativeFiltersModal,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const defaultMswParameters = {
  msw: {
    handlers: [
      getTRPCMock({
        type: 'query' as 'query',
        path: ['listTools'] as ['listTools'],
        response: {
          tools: [
            { id: '0eaa9a02-8055-4dbf-ac46-1e1f1f4e2a3a', name: 'PostgreSQL' },
            { id: '1eaa9a02-8055-4dbf-ac46-1e1f1f4e2a3b', name: 'Next.js' },
            { id: '2eaa9a02-8055-4dbf-ac46-1e1f1f4e2a3c', name: 'Sentry' },
          ],
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
        path: ['listOrganizationChildren'] as ['listOrganizationChildren'],
        response: {
          organizations: organizationOptions.map((organization) => ({ ...organization, hasChildren: false })),
          total: organizationOptions.length,
          pageSize: 50,
          standaloneOrganizationsCount: 1,
          unclassifiedInitiativesCount: 12,
        },
      }),
      getTRPCMock({
        type: 'query' as 'query',
        path: ['getOrganizations'] as ['getOrganizations'],
        response: {
          organizations: [organizationOptions[1]],
        },
      }),
    ],
  },
};

async function playOpenAndFindElement(canvasElement: HTMLElement): Promise<HTMLElement> {
  const canvas = within(canvasElement);
  const button = canvas.getByRole('button');

  await userEvent.click(button);

  const dialog = await screen.findByRole('dialog');
  return await within(dialog).findByRole('button', {
    name: /appliquer/i,
  });
}

const Template: StoryFn<ComponentType> = (args) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<InitiativeFiltersValue>(args.value);

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="contained">
        Display the filters modal
      </Button>
      <InitiativeFiltersModal
        open={open}
        value={value}
        onClose={() => setOpen(false)}
        onApply={(next) => {
          setValue(next);
          setOpen(false);
        }}
      />
    </>
  );
};

const DefaultStory = Template.bind({});
DefaultStory.args = {
  value: emptyInitiativeFilters,
};
DefaultStory.parameters = { ...defaultMswParameters };
DefaultStory.play = async ({ canvasElement }) => {
  await playOpenAndFindElement(canvasElement);
};

export const Default = prepareStory(DefaultStory);

const WithPreselectedStory = Template.bind({});
WithPreselectedStory.args = {
  value: {
    functionalUseCases: ['SENDS_EMAILS'],
    toolIds: ['1eaa9a02-8055-4dbf-ac46-1e1f1f4e2a3b'],
    organizationIds: [organizationOptions[1].id],
    unclassified: false,
    hasWebsite: true,
    hasRepository: false,
    httpSecurityGrades: ['F'],
    tlsGrades: [],
    legalNotice: 'without',
    privacyPolicy: null,
    foreignDependencyLevels: [],
  },
};
WithPreselectedStory.parameters = { ...defaultMswParameters };
WithPreselectedStory.play = async ({ canvasElement }) => {
  await playOpenAndFindElement(canvasElement);
};

export const WithPreselected = prepareStory(WithPreselectedStory);
