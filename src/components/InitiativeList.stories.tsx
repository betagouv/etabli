import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { InitiativeList } from '@etabli/src/components/InitiativeList';
import { initiatives } from '@etabli/src/fixtures/initiative';
import { ListDisplay } from '@etabli/src/utils/display';

type ComponentType = typeof InitiativeList;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/InitiativeList',
  component: InitiativeList,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

async function playFindList(parentElement: HTMLElement): Promise<HTMLElement> {
  return await within(parentElement).findByRole('list', {
    name: /liste/i,
  });
}

async function playFindGrid(parentElement: HTMLElement): Promise<HTMLElement> {
  return await within(parentElement).findByRole('grid', {
    name: /liste/i,
  });
}

const Template: StoryFn<ComponentType> = (args) => {
  return <InitiativeList {...args} />;
};

const GridStory = Template.bind({});
GridStory.args = {
  initiatives: initiatives,
  display: ListDisplay.GRID,
};
GridStory.parameters = {};
GridStory.play = async ({ canvasElement }) => {
  await playFindList(canvasElement);
};

export const Grid = prepareStory(GridStory, {});

const TableStory = Template.bind({});
TableStory.args = {
  initiatives: initiatives,
  display: ListDisplay.TABLE,
};
TableStory.parameters = {};
TableStory.play = async ({ canvasElement }) => {
  await playFindGrid(canvasElement);
};

export const Table = prepareStory(TableStory, {});
