import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { FlashMessage } from '@etabli/src/components/FlashMessage';

type ComponentType = typeof FlashMessage;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/FlashMessage',
  component: FlashMessage,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <FlashMessage {...args} />;
};

const DevelopmentEnvStory = Template.bind({});
DevelopmentEnvStory.args = {
  appMode: 'dev',
  nodeEnv: 'production',
};
DevelopmentEnvStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/version/i);
};

export const DevelopmentEnv = prepareStory(DevelopmentEnvStory);

const ProductionEnvStory = Template.bind({});
ProductionEnvStory.args = {
  appMode: 'prod',
  nodeEnv: 'production',
};

export const ProductionEnv = prepareStory(ProductionEnvStory);
