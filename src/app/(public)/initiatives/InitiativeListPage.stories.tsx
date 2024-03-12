import { Meta, StoryFn } from '@storybook/react';
import { userEvent, within } from '@storybook/testing-library';

import { ComponentProps, StoryHelperFactory } from '@etabli/.storybook/helpers';
import { playFindProgressBar } from '@etabli/.storybook/testing';
import { AsVisitor as PublicLayoutAsVisitorStory } from '@etabli/src/app/(public)/PublicLayout.stories';
import { InitiativeListPage, InitiativeListPageContext } from '@etabli/src/app/(public)/initiatives/InitiativeListPage';
import { Grid as InitiativeListGridStory } from '@etabli/src/components/InitiativeList.stories';
import { initiatives } from '@etabli/src/fixtures/initiative';
import { getTRPCMock } from '@etabli/src/server/mock/trpc';

type ComponentType = typeof InitiativeListPage;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Pages/InitiativeList',
  component: InitiativeListPage,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const mswListInitiativesParameters = {
  type: 'query' as 'query',
  path: ['listInitiatives'] as ['listInitiatives'],
  response: {
    initiatives: [initiatives[0], initiatives[1], initiatives[2]],
  },
};

const defaultMswParameters = {
  msw: {
    handlers: [getTRPCMock(mswListInitiativesParameters)],
  },
};

const commonComponentProps: ComponentProps<ComponentType> = {
  params: {
    authorityId: 'b79cb3ba-745e-5d9a-8903-4a02327a7e01',
  },
};

async function playFindSearchInput(canvasElement: HTMLElement): Promise<HTMLElement> {
  return await within(canvasElement).findByPlaceholderText(/rechercher/i);
}

const Template: StoryFn<ComponentType> = (args) => {
  return <InitiativeListPage {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = {
  ...commonComponentProps,
};
NormalStory.parameters = { ...defaultMswParameters };
NormalStory.play = async ({ canvasElement }) => {
  await playFindSearchInput(canvasElement);
};

export const Normal = prepareStory(NormalStory, {
  childrenContext: {
    context: InitiativeListPageContext,
    value: {
      ContextualInitiativeList: InitiativeListGridStory,
    },
  },
});

const WithLayoutStory = Template.bind({});
WithLayoutStory.args = {
  ...commonComponentProps,
};
WithLayoutStory.parameters = {
  layout: 'fullscreen',
  msw: {
    handlers: [
      getTRPCMock({
        ...mswListInitiativesParameters,
      }),
    ],
  },
};
WithLayoutStory.play = async ({ canvasElement }) => {
  await playFindSearchInput(canvasElement);
};

export const WithLayout = prepareStory(WithLayoutStory, {
  layoutStory: PublicLayoutAsVisitorStory,
  childrenContext: {
    context: InitiativeListPageContext,
    value: {
      ContextualInitiativeList: InitiativeListGridStory,
    },
  },
});

const SearchLoadingWithLayoutStory = Template.bind({});
SearchLoadingWithLayoutStory.args = {
  ...commonComponentProps,
};
SearchLoadingWithLayoutStory.parameters = {
  layout: 'fullscreen',
  counter: 0,
  msw: {
    handlers: [
      getTRPCMock({
        ...mswListInitiativesParameters,
        delayHook: (req, params) => {
          // It will be infinite for all except the first query that allows displaying almost all the page
          if (SearchLoadingWithLayoutStory.parameters?.counter !== undefined) {
            SearchLoadingWithLayoutStory.parameters.counter++;

            if (SearchLoadingWithLayoutStory.parameters.counter > 1) {
              return 'infinite';
            }
          }

          return null;
        },
      }),
    ],
  },
};
SearchLoadingWithLayoutStory.play = async ({ canvasElement }) => {
  if (SearchLoadingWithLayoutStory.parameters?.counter !== undefined) {
    SearchLoadingWithLayoutStory.parameters.counter = 0;
  }

  const searchInput = await playFindSearchInput(canvasElement);

  await userEvent.type(searchInput, 'Ma belle recherche');

  await playFindProgressBar(canvasElement, /liste/i);
};

export const SearchLoadingWithLayout = prepareStory(SearchLoadingWithLayoutStory, {
  layoutStory: PublicLayoutAsVisitorStory,
  childrenContext: {
    context: InitiativeListPageContext,
    value: {
      ContextualInitiativeList: InitiativeListGridStory,
    },
  },
});
