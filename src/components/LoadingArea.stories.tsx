import { Meta, StoryFn } from '@storybook/react';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { playFindProgressBar } from '@etabli/.storybook/testing';
import { LoadingArea } from '@etabli/src/components/LoadingArea';

type ComponentType = typeof LoadingArea;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/LoadingArea',
  component: LoadingArea,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <LoadingArea {...args} />;
};

const DefaultStory = Template.bind({});
DefaultStory.args = {
  ariaLabelTarget: 'random',
};
DefaultStory.play = async ({ canvasElement }) => {
  await playFindProgressBar(canvasElement, /chargement/i);
};

export const Default = prepareStory(DefaultStory);
