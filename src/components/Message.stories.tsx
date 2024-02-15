import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { Message } from '@etabli/src/components/Message';
import { messages } from '@etabli/src/fixtures/assistant';

type ComponentType = typeof Message;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/Message',
  component: Message,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

async function playFindElement(canvasElement: HTMLElement): Promise<HTMLElement> {
  return await within(canvasElement).findByText(/qui/i);
}

const Template: StoryFn<ComponentType> = (args) => {
  return <Message {...args} />;
};

const UserStory = Template.bind({});
UserStory.args = {
  message: messages[0],
};
UserStory.parameters = {};
UserStory.play = async ({ canvasElement }) => {
  await playFindElement(canvasElement);
};

export const User = prepareStory(UserStory);

const AssistantStory = Template.bind({});
AssistantStory.args = {
  message: messages[1],
};
AssistantStory.parameters = {};
AssistantStory.play = async ({ canvasElement }) => {
  await playFindElement(canvasElement);
};

export const Assistant = prepareStory(AssistantStory);
