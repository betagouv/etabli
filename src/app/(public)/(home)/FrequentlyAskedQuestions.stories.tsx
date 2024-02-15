import { Meta, StoryFn } from '@storybook/react';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { FrequentlyAskedQuestions } from '@etabli/src/app/(public)/(home)/FrequentlyAskedQuestions';

type ComponentType = typeof FrequentlyAskedQuestions;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/Home/FrequentlyAskedQuestions',
  component: FrequentlyAskedQuestions,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <FrequentlyAskedQuestions />;
};

const NormalStory = Template.bind({});
NormalStory.args = {};
NormalStory.parameters = {};

export const Normal = prepareStory(NormalStory);
