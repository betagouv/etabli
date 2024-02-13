import Button from '@mui/material/Button';
import { Meta, StoryFn } from '@storybook/react';
import { screen, userEvent, within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { ErrorDialog } from '@etabli/src/components/ErrorDialog';
import { useSingletonErrorDialog } from '@etabli/src/components/modal/useModal';

type ComponentType = typeof ErrorDialog;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/ErrorDialog',
  component: ErrorDialog,
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
    name: /d'accord/i,
  });
}

const Template: StoryFn<ComponentType> = (args) => {
  const { showErrorDialog } = useSingletonErrorDialog();

  const onClick = async () => {
    showErrorDialog({
      ...args,
    });
  };

  return (
    <Button onClick={onClick} variant="contained">
      Display the error dialog
    </Button>
  );
};

const DefaultStory = Template.bind({});
DefaultStory.args = {
  description: <>An error has occured while changing your address.</>,
  error: new Error('this is a custom test error'),
};
DefaultStory.play = async ({ canvasElement }) => {
  await playOpenAndFindElement(canvasElement);
};

export const Default = prepareStory(DefaultStory);
