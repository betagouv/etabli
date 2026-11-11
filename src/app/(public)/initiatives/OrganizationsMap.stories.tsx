import { Meta, StoryFn } from '@storybook/nextjs';
import { within } from 'storybook/test';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { OrganizationsMap } from '@etabli/src/app/(public)/initiatives/OrganizationsMap';
import { initiatives, organizationsMap } from '@etabli/src/fixtures/initiative';
import { getTRPCMock } from '@etabli/src/server/mock/trpc';

type ComponentType = typeof OrganizationsMap;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/OrganizationsMap',
  component: OrganizationsMap,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const defaultMswParameters = {
  msw: {
    handlers: [
      getTRPCMock({
        type: 'query',
        path: ['getOrganizationsMap'],
        response: organizationsMap,
      }),
      getTRPCMock({
        type: 'query',
        path: ['listInitiatives'],
        response: { initiatives: initiatives, totalCount: initiatives.length },
      }),
      getTRPCMock({
        type: 'query',
        path: ['getToolsBreakdown'],
        response: {
          initiativesCount: 1520,
          tools: [
            { name: 'PHP', percentage: 42.5 },
            { name: 'TypeScript', percentage: 18.2 },
          ],
          othersPercentage: 12.3,
          notSpecifiedPercentage: 27,
        },
      }),
    ],
  },
};

async function playFindElement(canvasElement: HTMLElement): Promise<HTMLElement> {
  return await within(canvasElement).findByRole('img', {
    name: /carte des organisations/i,
  });
}

const Template: StoryFn<ComponentType> = (args) => {
  return <OrganizationsMap {...args} />;
};

const commonArgs = {
  focusedNodeId: null,
  colorMode: 'composition' as const,
  onColorModeChange: () => {},
  onFocus: () => {},
  listHref: '/initiatives',
  onShowList: () => {},
};

const NormalStory = Template.bind({});
NormalStory.args = {
  ...commonArgs,
  filterBy: { query: null },
};
NormalStory.parameters = { ...defaultMswParameters };
NormalStory.play = async ({ canvasElement }) => {
  await playFindElement(canvasElement);
};

export const Normal = prepareStory(NormalStory);

const SearchingStory = Template.bind({});
SearchingStory.args = {
  ...commonArgs,
  filterBy: { query: 'accessibilité' },
};
SearchingStory.parameters = { ...defaultMswParameters };
SearchingStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/meilleurs résultats/i);
};

export const Searching = prepareStory(SearchingStory);
