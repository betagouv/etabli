import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { InitiativeCard } from '@etabli/src/components/InitiativeCard';
import { initiatives } from '@etabli/src/fixtures/initiative';

type ComponentType = typeof InitiativeCard;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/InitiativeCard',
  component: InitiativeCard,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

async function playFindElement(canvasElement: HTMLElement): Promise<HTMLElement> {
  return await within(canvasElement).findByText(/great project/i);
}

const Template: StoryFn<ComponentType> = (args) => {
  return <InitiativeCard {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = {
  initiativeLink: '',
  initiative: initiatives[0],
};
NormalStory.play = async ({ canvasElement }) => {
  await playFindElement(canvasElement);
};

export const Normal = prepareStory(NormalStory);
