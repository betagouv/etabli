import { Meta, StoryFn } from '@storybook/react';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { KeyReasons } from '@etabli/src/app/(public)/(home)/KeyReasons';

type ComponentType = typeof KeyReasons;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/Home/KeyReasons',
  component: KeyReasons,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <KeyReasons />;
};

const NormalStory = Template.bind({});
NormalStory.args = {};
NormalStory.parameters = {};

export const Normal = prepareStory(NormalStory);
