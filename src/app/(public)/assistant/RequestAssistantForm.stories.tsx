import { Meta, StoryFn } from '@storybook/react';
import { rest } from 'msw';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { RequestAssistantForm } from '@etabli/src/app/(public)/assistant/RequestAssistantForm';
import { messages } from '@etabli/src/fixtures/assistant';
import { RequestAssistantPrefillSchema, RequestAssistantSchemaType } from '@etabli/src/models/actions/assistant';
import { mockBaseUrl } from '@etabli/src/server/mock/environment';

type ComponentType = typeof RequestAssistantForm;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Forms/RequestAssistant',
  component: RequestAssistantForm,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const defaultMswParameters = {
  msw: {
    handlers: [
      rest.post<RequestAssistantSchemaType>(`${mockBaseUrl}/api/request-assistant`, (req, res, ctx) => {
        return res(
          ctx.status(200), // Set the response status
          ctx.text(messages[1].content)
        );
      }),
    ],
  },
};

const Template: StoryFn<ComponentType> = (args) => {
  return <RequestAssistantForm {...args} />;
};

const EmptyStory = Template.bind({});
EmptyStory.args = {
  prefill: RequestAssistantPrefillSchema.parse({
    sessionId: 'b79cb3ba-745e-5d9a-8903-4a02327a7e01',
  }),
};
EmptyStory.parameters = { ...defaultMswParameters };

export const Empty = prepareStory(EmptyStory);

const FilledStory = Template.bind({});
FilledStory.args = {
  prefill: RequestAssistantPrefillSchema.parse({
    sessionId: 'b79cb3ba-745e-5d9a-8903-4a02327a7e01',
    message:
      'Nihil voluptatem quam omnis sit voluptatem quod qui. Magni blanditiis et quod. Laboriosam qui quam illum explicabo nemo perspiciatis maxime. Harum rerum vel ex alias consectetur ipsum enim. Ut illo dolorum ut.',
  }),
};
FilledStory.parameters = { ...defaultMswParameters };

export const Filled = prepareStory(FilledStory);
