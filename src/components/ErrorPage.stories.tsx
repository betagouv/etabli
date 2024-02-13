import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { playFindAlert } from '@etabli/.storybook/testing';
import { ErrorPage, error404Props, error500Props, error503Props } from '@etabli/src/components/ErrorPage';

type ComponentType = typeof ErrorPage;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/ErrorPage',
  component: ErrorPage,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <ErrorPage {...args} />;
};

const Error404Story = Template.bind({});
Error404Story.args = { ...error404Props };
Error404Story.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const Error404 = prepareStory(Error404Story);

const Error500Story = Template.bind({});
Error500Story.args = { ...error500Props };
Error500Story.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const Error500 = prepareStory(Error500Story);

const Error503Story = Template.bind({});
Error503Story.args = { ...error503Props };
Error503Story.play = async ({ canvasElement }) => {
  await playFindAlert(canvasElement);
};

export const Error503 = prepareStory(Error503Story);
