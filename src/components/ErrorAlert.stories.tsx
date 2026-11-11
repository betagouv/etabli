import { Meta, StoryFn } from '@storybook/nextjs';
import { within } from 'storybook/test';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { playFindAlert } from '@etabli/.storybook/testing';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { CustomError } from '@etabli/src/models/entities/errors';

type ComponentType = typeof ErrorAlert;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/ErrorAlert',
  component: ErrorAlert,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <ErrorAlert {...args} />;
};

// Business errors keep their message, whereas any other error is shown as an unexpected one
const OneErrorStory = Template.bind({});
OneErrorStory.args = {
  errors: [new CustomError('storyError', 'this is an error')],
};
OneErrorStory.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const OneError = prepareStory(OneErrorStory);

const MultipleErrorsStory = Template.bind({});
MultipleErrorsStory.args = {
  errors: [
    new CustomError('storyError', 'this is the first error'),
    new CustomError('storyError', 'this is the second error'),
    new CustomError('storyError', 'duplicated error is shown once'),
    new CustomError('storyError', 'duplicated error is shown once'),
  ],
};
MultipleErrorsStory.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const MultipleErrors = prepareStory(MultipleErrorsStory);

// Only an error of the server can be retried, it is shown as an internal error whatever its message
const serverError = new Error('this is an error');
serverError.name = 'TRPCClientError';

const WithRetryStory = Template.bind({});
WithRetryStory.args = {
  errors: [serverError],
  refetchs: [() => Promise.resolve()],
};
WithRetryStory.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const WithRetry = prepareStory(WithRetryStory);
