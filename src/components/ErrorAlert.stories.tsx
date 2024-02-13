import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { playFindAlert } from '@etabli/.storybook/testing';
import { ErrorAlert } from '@etabli/src/components/ErrorAlert';

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

const OneErrorStory = Template.bind({});
OneErrorStory.args = {
  errors: [new Error('this is an error')],
};
OneErrorStory.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const OneError = prepareStory(OneErrorStory);

const MultipleErrorsStory = Template.bind({});
MultipleErrorsStory.args = {
  errors: [
    new Error('this is the first error'),
    new Error('this is the second error'),
    new Error('duplicated error is shown once'),
    new Error('duplicated error is shown once'),
  ],
};
MultipleErrorsStory.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const MultipleErrors = prepareStory(MultipleErrorsStory);

const WithRetryStory = Template.bind({});
WithRetryStory.args = {
  errors: [new Error('this is an error')],
  refetchs: [() => Promise.resolve()],
};
WithRetryStory.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const WithRetry = prepareStory(WithRetryStory);
