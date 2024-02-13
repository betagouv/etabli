import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { Avatar } from '@etabli/src/components/Avatar';

type ComponentType = typeof Avatar;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/Avatar',
  component: Avatar,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <Avatar {...args} />;
};

const DefaultStory = Template.bind({});
DefaultStory.args = {
  fullName: 'Marguerite Derrien',
};
DefaultStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/MD/i);
};

export const Default = prepareStory(DefaultStory);
