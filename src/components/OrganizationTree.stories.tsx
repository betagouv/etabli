import { Meta, StoryFn } from '@storybook/nextjs';
import { within } from 'storybook/test';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { OrganizationTree } from '@etabli/src/components/OrganizationTree';
import { organizations } from '@etabli/src/fixtures/initiative';
import { getOrganizationPath } from '@etabli/src/utils/organization';

type ComponentType = typeof OrganizationTree;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/OrganizationTree',
  component: OrganizationTree,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return (
    <div style={{ maxWidth: 420 }}>
      <OrganizationTree {...args} />
    </div>
  );
};

const SingleBranchStory = Template.bind({});
SingleBranchStory.args = {
  paths: [getOrganizationPath(organizations[0])],
};
SingleBranchStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/organisation rattachée/i);
};

export const SingleBranch = prepareStory(SingleBranchStory);

const SharedAncestorsStory = Template.bind({});
SharedAncestorsStory.args = {
  // Both branches share the first levels which are only displayed once
  paths: [getOrganizationPath(organizations[0]), getOrganizationPath(organizations[1])],
};
SharedAncestorsStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/transition écologique/i);
};

export const SharedAncestors = prepareStory(SharedAncestorsStory);
