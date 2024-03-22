import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { CsvViewer } from '@etabli/src/components/CsvViewer';
import { initiatives } from '@etabli/src/fixtures/initiative';
import { initiativesToCsv } from '@etabli/src/utils/csv';

type ComponentType = typeof CsvViewer;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/CsvViewer',
  component: CsvViewer,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <CsvViewer {...args} />;
};

const InitiativesExampleStory = Template.bind({});
InitiativesExampleStory.args = {
  data: initiativesToCsv(initiatives),
};
InitiativesExampleStory.parameters = {};
InitiativesExampleStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByRole('grid', {
    name: /lignes/i,
  });
};

export const InitiativesExample = prepareStory(InitiativesExampleStory);
