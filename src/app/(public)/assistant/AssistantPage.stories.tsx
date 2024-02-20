import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { AsVisitor as PublicLayoutAsVisitorStory } from '@etabli/src/app/(public)/PublicLayout.stories';
import { AssistantPage, AssistantPageContext } from '@etabli/src/app/(public)/assistant/AssistantPage';
import { Empty as RequestAssistantFormEmptyStory } from '@etabli/src/app/(public)/assistant/RequestAssistantForm.stories';
import { messages } from '@etabli/src/fixtures/assistant';

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
  return await within(canvasElement).findByText(/numquam/i);
}

const Template: StoryFn<ComponentType> = (args) => {
  return <AssistantPage {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = {};
NormalStory.parameters = {};
NormalStory.play = async ({ canvasElement }) => {
  await playFindPlaceholerElement(canvasElement);
};

export const Normal = prepareStory(NormalStory, {
  childrenContext: {
    context: AssistantPageContext,
    value: {
      ContextualRequestAssistantForm: RequestAssistantFormEmptyStory,
    },
  },
});

const WithLayoutStory = Template.bind({});
WithLayoutStory.args = {};
WithLayoutStory.parameters = {
  layout: 'fullscreen',
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
HistoryStory.parameters = {};
HistoryStory.play = async ({ canvasElement }) => {
  await playFindFirstMessageElement(canvasElement);
};

export const History = prepareStory(HistoryStory, {
  childrenContext: {
    context: AssistantPageContext,
    value: {
      ContextualRequestAssistantForm: RequestAssistantFormEmptyStory,
    },
  },
});

const HistoryWithLayoutStory = Template.bind({});
HistoryWithLayoutStory.args = {
  ...HistoryStory.args,
};
HistoryWithLayoutStory.parameters = {
  layout: 'fullscreen',
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
