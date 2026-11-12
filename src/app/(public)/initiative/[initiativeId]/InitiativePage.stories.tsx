import { Meta, StoryFn } from '@storybook/nextjs';
import { within } from 'storybook/test';

import { ComponentProps, StoryHelperFactory } from '@etabli/.storybook/helpers';
import { AsVisitor as PublicLayoutAsVisitorStory } from '@etabli/src/app/(public)/PublicLayout.stories';
import { InitiativePage } from '@etabli/src/app/(public)/initiative/[initiativeId]/InitiativePage';
import { domainsReputation, initiatives } from '@etabli/src/fixtures/initiative';
import { getTRPCMock } from '@etabli/src/server/mock/trpc';

type ComponentType = typeof InitiativePage;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Pages/Initiative',
  component: InitiativePage,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const defaultMswParameters = {
  msw: {
    handlers: [
      getTRPCMock({
        type: 'query',
        path: ['getInitiative'],
        response: {
          initiative: initiatives[0],
          repositoriesStars: { [initiatives[0].repositories[0]]: 1234 },
          toolsIds: Object.fromEntries(
            initiatives[0].tools.map((tool, index) => [tool, `c0ffee00-0000-4000-8000-${String(index).padStart(12, '0')}`])
          ),
        },
      }),
      getTRPCMock({
        type: 'query',
        path: ['getInitiativeReputation'],
        response: {
          domains: domainsReputation,
        },
      }),
    ],
  },
};

const commonComponentProps: ComponentProps<ComponentType> = {
  params: {
    initiativeId: initiatives[0].id,
  },
  relatedInitiatives: initiatives.slice(1, 4).map((initiative) => ({
    id: initiative.id,
    name: initiative.name,
    description: initiative.description,
    websites: initiative.websites,
    repositories: initiative.repositories,
  })),
};

async function playFindElement(canvasElement: HTMLElement): Promise<HTMLElement> {
  return await within(canvasElement).findByRole('heading', {
    level: 1,
    name: /great/i,
  });
}

const Template: StoryFn<ComponentType> = (args) => {
  return <InitiativePage {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = {
  ...commonComponentProps,
};
NormalStory.parameters = { ...defaultMswParameters };
NormalStory.play = async ({ canvasElement }) => {
  await playFindElement(canvasElement);
};

export const Normal = prepareStory(NormalStory, {});

const WithLayoutStory = Template.bind({});
WithLayoutStory.args = {
  ...commonComponentProps,
};
WithLayoutStory.parameters = {
  layout: 'fullscreen',
  ...defaultMswParameters,
};
WithLayoutStory.play = async ({ canvasElement }) => {
  await playFindElement(canvasElement);
};

export const WithLayout = prepareStory(WithLayoutStory, {
  layoutStory: PublicLayoutAsVisitorStory,
});
