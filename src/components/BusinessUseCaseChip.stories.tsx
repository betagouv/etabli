import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { BusinessUseCaseChip } from '@etabli/src/components/BusinessUseCaseChip';

type ComponentType = typeof BusinessUseCaseChip;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/BusinessUseCaseChip',
  component: BusinessUseCaseChip,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return (
    <div>
      <BusinessUseCaseChip {...args} />
    </div>
  );
};

const NormalStory = Template.bind({});
NormalStory.args = {
  label: 'Autem blanditiis id maxime dolorem repellat provident qui',
};
NormalStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/Autem/i);
};

export const Normal = prepareStory(NormalStory);
