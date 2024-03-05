import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { ToolChip } from '@etabli/src/components/ToolChip';

type ComponentType = typeof ToolChip;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/ToolChip',
  component: ToolChip,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return (
    <div>
      <ToolChip {...args} />
    </div>
  );
};

const NormalStory = Template.bind({});
NormalStory.args = {
  label: 'TypeScript',
};
NormalStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/TypeScript/i);
};

export const Normal = prepareStory(NormalStory);
