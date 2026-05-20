import Button from '@mui/material/Button';
import { Meta, StoryFn } from '@storybook/react';
import { screen, userEvent, within } from '@storybook/test';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { ExploreModal, useSingletonExploreModal } from '@etabli/src/components/ExploreModal';

type ComponentType = typeof ExploreModal;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/ExploreModal',
  component: ExploreModal,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

async function playOpenAndFindElement(canvasElement: HTMLElement): Promise<HTMLElement> {
  const canvas = within(canvasElement);
  const button = canvas.getByRole('button');

  await userEvent.click(button);

  const dialog = await screen.findByRole('dialog');
  return await within(dialog).findByRole('button', {
    name: /recherche/i,
  });
}

const Template: StoryFn<ComponentType> = (args) => {
  const { showExploreModal } = useSingletonExploreModal();

  const onClick = async () => {
    showExploreModal();
  };

  return (
    <Button onClick={onClick} variant="contained">
      Display the explore modal
    </Button>
  );
};

const DefaultStory = Template.bind({});
DefaultStory.args = {};
DefaultStory.play = async ({ canvasElement }) => {
  await playOpenAndFindElement(canvasElement);
};

export const Default = prepareStory(DefaultStory);
