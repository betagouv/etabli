import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { FunctionalUseCaseChip } from '@etabli/src/components/FunctionalUseCaseChip';
import { FunctionalUseCaseSchema } from '@etabli/src/models/entities/initiative';

type ComponentType = typeof FunctionalUseCaseChip;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/FunctionalUseCaseChip',
  component: FunctionalUseCaseChip,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return (
    <div>
      <FunctionalUseCaseChip {...args} />
    </div>
  );
};

const NormalStory = Template.bind({});
NormalStory.args = {
  useCase: FunctionalUseCaseSchema.Values.SENDS_EMAILS,
};
NormalStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/emails/i);
};

export const Normal = prepareStory(NormalStory);
