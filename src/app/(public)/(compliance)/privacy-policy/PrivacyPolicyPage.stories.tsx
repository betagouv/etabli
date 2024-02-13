import { Meta, StoryFn } from '@storybook/react';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { PrivacyPolicyPage } from '@etabli/src/app/(public)/(compliance)/privacy-policy/PrivacyPolicyPage';
import { AsVisitor as PublicLayoutAsVisitorStory } from '@etabli/src/app/(public)/PublicLayout.stories';

type ComponentType = typeof PrivacyPolicyPage;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Pages/PrivacyPolicy',
  component: PrivacyPolicyPage,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <PrivacyPolicyPage />;
};

const NormalStory = Template.bind({});
NormalStory.args = {};
NormalStory.parameters = {};

export const Normal = prepareStory(NormalStory);

const WithLayoutStory = Template.bind({});
WithLayoutStory.args = {};
WithLayoutStory.parameters = {
  layout: 'fullscreen',
};

export const WithLayout = prepareStory(WithLayoutStory, {
  layoutStory: PublicLayoutAsVisitorStory,
});
