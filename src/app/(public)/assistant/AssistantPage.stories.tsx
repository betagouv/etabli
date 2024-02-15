import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { AsVisitor as PublicLayoutAsVisitorStory } from '@etabli/src/app/(public)/PublicLayout.stories';
import { AssistantPage, AssistantPageContext } from '@etabli/src/app/(public)/assistant/AssistantPage';
import { Empty as RequestAssistantFormEmptyStory } from '@etabli/src/app/(public)/assistant/RequestAssistantForm.stories';
import { chunks, messages } from '@etabli/src/fixtures/assistant';
import { getTRPCMock } from '@etabli/src/server/mock/trpc';

type ComponentType = typeof AssistantPage;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Pages/Assistant',
  component: AssistantPage,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

async function playFindPlaceholerElement(canvasElement: HTMLElement): Promise<HTMLElement> {
  return await within(canvasElement).findByText(/recherchez/i);
}

async function playFindFirstMessageElement(canvasElement: HTMLElement): Promise<HTMLElement> {
  return await within(canvasElement).findByText(/voluptatem/i);
}

const defaultMswParameters = {
  msw: {
    handlers: [
      getTRPCMock({
        type: 'subscription',
        path: ['subscribeAssistantAnswerChunk'],
        response: chunks[0],
      }),
    ],
  },
};

const Template: StoryFn<ComponentType> = (args) => {
  return <AssistantPage {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = {};
NormalStory.parameters = {
  ...defaultMswParameters,
};
NormalStory.play = async ({ canvasElement }) => {
  await playFindPlaceholerElement(canvasElement);
};

export const Normal = prepareStory(NormalStory, {});

const WithLayoutStory = Template.bind({});
WithLayoutStory.args = {};
WithLayoutStory.parameters = {
  layout: 'fullscreen',
  ...defaultMswParameters,
};
WithLayoutStory.play = async ({ canvasElement }) => {
  await playFindPlaceholerElement(canvasElement);
};

export const WithLayout = prepareStory(WithLayoutStory, {
  layoutStory: PublicLayoutAsVisitorStory,
  childrenContext: {
    context: AssistantPageContext,
    value: {
      ContextualRequestAssistantForm: RequestAssistantFormEmptyStory,
    },
  },
});

const HistoryStory = Template.bind({});
HistoryStory.args = {
  prefilledMessages: messages,
};
HistoryStory.parameters = {
  ...defaultMswParameters,
};
HistoryStory.play = async ({ canvasElement }) => {
  await playFindFirstMessageElement(canvasElement);
};

export const History = prepareStory(HistoryStory, {});

const HistoryWithLayoutStory = Template.bind({});
HistoryWithLayoutStory.args = {
  ...HistoryStory.args,
};
HistoryWithLayoutStory.parameters = {
  layout: 'fullscreen',
  ...defaultMswParameters,
};
HistoryWithLayoutStory.play = async ({ canvasElement }) => {
  await playFindFirstMessageElement(canvasElement);
};

export const HistoryWithLayout = prepareStory(HistoryWithLayoutStory, {
  layoutStory: PublicLayoutAsVisitorStory,
  childrenContext: {
    context: AssistantPageContext,
    value: {
      ContextualRequestAssistantForm: RequestAssistantFormEmptyStory,
    },
  },
});
