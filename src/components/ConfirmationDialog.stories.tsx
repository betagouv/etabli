import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Meta, StoryFn } from '@storybook/react';
import { screen, userEvent, within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { ConfirmationDialog } from '@etabli/src/components/ConfirmationDialog';
import { useSingletonConfirmationDialog } from '@etabli/src/components/modal/useModal';
import { sleep } from '@etabli/src/utils/sleep';

type ComponentType = typeof ConfirmationDialog;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/ConfirmationDialog',
  component: ConfirmationDialog,
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
    name: /confirmer/i,
  });
}

const Template: StoryFn<ComponentType> = (args) => {
  const { showConfirmationDialog } = useSingletonConfirmationDialog();

  const onClick = async () => {
    showConfirmationDialog({
      ...args,
    });
  };

  return (
    <Button onClick={onClick} variant="contained">
      Display the confirmation dialog
    </Button>
  );
};

const DefaultStory = Template.bind({});
DefaultStory.args = {
  description: (
    <>
      Do you want to confirm after reading{' '}
      <Typography component="span" sx={{ fontWeight: 'bold' }}>
        this text
      </Typography>
      ?
    </>
  ),
  onConfirm: async () => {},
  onCancel: async () => {},
};
DefaultStory.play = async ({ canvasElement }) => {
  await playOpenAndFindElement(canvasElement);
};

export const Default = prepareStory(DefaultStory);

const LongConfirmActionStory = Template.bind({});
LongConfirmActionStory.args = {
  onConfirm: async () => {
    await sleep(1 * 24 * 60 * 60 * 1000);
  },
  onCancel: async () => {},
};
LongConfirmActionStory.play = async ({ canvasElement }) => {
  const confirmButton = await playOpenAndFindElement(canvasElement);

  await userEvent.click(confirmButton);
};

export const LongConfirmAction = prepareStory(LongConfirmActionStory);

const ConfirmActionErrorStory = Template.bind({});
ConfirmActionErrorStory.args = {
  onConfirm: async () => {
    throw new Error('there is an error');
  },
  onCancel: async () => {},
};
ConfirmActionErrorStory.play = async ({ canvasElement }) => {
  const confirmButton = await playOpenAndFindElement(canvasElement);

  await userEvent.click(confirmButton);
};

export const ConfirmActionError = prepareStory(ConfirmActionErrorStory);
