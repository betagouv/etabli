import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import agent1 from '@etabli/src/assets/images/agent_1.png';
import { QuickAccessCard } from '@etabli/src/components/QuickAccessCard';

type ComponentType = typeof QuickAccessCard;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/QuickAccessCard',
  component: QuickAccessCard,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <QuickAccessCard {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = {
  image: agent1,
  imageAlt: '',
  text: 'Qui quam ut',
  link: '',
};
NormalStory.parameters = {};
NormalStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByRole('button', {
    name: /quam/i,
  });
};

export const Normal = prepareStory(NormalStory);
