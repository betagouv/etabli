import { Meta, StoryFn } from '@storybook/react';
import { userEvent, within } from '@storybook/test';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { OrganizationChip, OrganizationChips, UnclassifiedOrganizationChip } from '@etabli/src/components/OrganizationChip';
import { organizations } from '@etabli/src/fixtures/initiative';
import { summarizeOrganizations } from '@etabli/src/utils/organization';

type ComponentType = typeof OrganizationChip;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/OrganizationChip',
  component: OrganizationChip,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return (
    <div style={{ maxWidth: 360 }}>
      <OrganizationChip {...args} />
    </div>
  );
};

const NormalStory = Template.bind({});
NormalStory.args = {
  summary: summarizeOrganizations([organizations[0]])[0],
  linkToInitiatives: true,
};
NormalStory.play = async ({ canvasElement }) => {
  const chip = await within(canvasElement).findByRole('link', { name: /voir les initiatives/i });

  // The tooltip displays the whole branch
  await userEvent.hover(chip);
};

export const Normal = prepareStory(NormalStory);

const FocusedStory = Template.bind({});
FocusedStory.args = {
  // When filtering on the DINUM it is displayed instead of its ministry
  summary: summarizeOrganizations([organizations[0]], [organizations[0].ancestors[3].id])[0],
  linkToInitiatives: true,
};
FocusedStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/DINUM/i);
};

export const Focused = prepareStory(FocusedStory);

// Other exported components of the same file are rendered with fixed props (args are only typed for the main one)
const CrossOrganizationsStory: StoryFn<ComponentType> = () => {
  return (
    <div style={{ maxWidth: 360 }}>
      <OrganizationChips summaries={summarizeOrganizations(organizations)} websitesCount={1} repositoriesCount={1} linkToInitiatives />
    </div>
  );
};
CrossOrganizationsStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/mairie/i);
};

export const CrossOrganizations = prepareStory(CrossOrganizationsStory);

const UnclassifiedStory: StoryFn<ComponentType> = () => {
  return <UnclassifiedOrganizationChip websitesCount={1} repositoriesCount={0} linkToInitiatives />;
};
UnclassifiedStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByText(/non classée/i);
};

export const Unclassified = prepareStory(UnclassifiedStory);
