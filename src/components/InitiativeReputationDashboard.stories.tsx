import { Meta, StoryFn } from '@storybook/react';
import { screen, userEvent, within } from '@storybook/test';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { InitiativeReputationDashboard } from '@etabli/src/components/InitiativeReputationDashboard';
import { domainsReputation } from '@etabli/src/fixtures/initiative';
import { DomainReputationSchemaType } from '@etabli/src/models/entities/initiative';
import { getTRPCMock } from '@etabli/src/server/mock/trpc';

type ComponentType = typeof InitiativeReputationDashboard;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/InitiativeReputationDashboard',
  component: InitiativeReputationDashboard,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

function getMswParameters(domains: DomainReputationSchemaType[]) {
  return {
    msw: {
      handlers: [
        getTRPCMock({
          type: 'query' as 'query',
          path: ['getInitiativeReputation'] as ['getInitiativeReputation'],
          response: {
            domains: domains,
          },
        }),
      ],
    },
  };
}

const defaultArgs = {
  initiativeId: 'b79cb3ba-745e-5d9a-8903-4a02327a7e01',
};

const Template: StoryFn<ComponentType> = (args) => {
  return <InitiativeReputationDashboard {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = defaultArgs;
NormalStory.parameters = getMswParameters(domainsReputation);
NormalStory.play = async ({ canvasElement }) => {
  const layout = await findDisplayedLayout(canvasElement);

  await within(layout).findByText(/^En-têtes/); // Its label is shorter in the side column
  await within(layout).findByText('Certificat et TLS');
  await within(layout).findByText('Protection des e-mails');
  await within(layout).findByText('Notoriété 95 %'); // The one of the selected website

  // Only displayed when the page is wide enough to have a side column
  const detailsButton = within(layout).queryByRole('button', { name: 'Voir tout le détail' });

  if (detailsButton) {
    await userEvent.click(detailsButton);
    await within(await screen.findByRole('dialog')).findByText('Mentions légales');
  }
};

export const Normal = prepareStory(NormalStory);

const WithoutAnyIssueStory = Template.bind({});
WithoutAnyIssueStory.args = defaultArgs;
WithoutAnyIssueStory.parameters = getMswParameters([
  {
    ...domainsReputation[0],
    httpSecurityGrade: 'A+',
    tlsLevel: 0,
    tlsIssues: [],
    mailSecurityLevel: 0,
    mailIssues: [],
  },
]);
WithoutAnyIssueStory.play = async ({ canvasElement }) => {
  const issuesLevels = await within(await findDisplayedLayout(canvasElement)).findAllByText('Bon');

  expectQuantity(issuesLevels, 2);
};

export const WithoutAnyIssue = prepareStory(WithoutAnyIssueStory);

const WithSeriousIssuesStory = Template.bind({});
WithSeriousIssuesStory.args = defaultArgs;
WithSeriousIssuesStory.parameters = getMswParameters([
  {
    ...domainsReputation[0],
    httpSecurityGrade: 'F',
    tlsLevel: 2,
    tlsIssues: ['certificate_expired', 'legacy_tls'],
    mailSecurityLevel: 2,
    mailIssues: ['spf_invalid', 'dmarc_missing'],
  },
]);
WithSeriousIssuesStory.play = async ({ canvasElement }) => {
  const issuesLevels = await within(await findDisplayedLayout(canvasElement)).findAllByText('À corriger');

  expectQuantity(issuesLevels, 2);
};

export const WithSeriousIssues = prepareStory(WithSeriousIssuesStory);

const WithoutMailStory = Template.bind({});
WithoutMailStory.args = defaultArgs;
WithoutMailStory.parameters = getMswParameters([
  {
    ...domainsReputation[0],
    usesMail: false,
    mailSecurityLevel: 0,
    mailIssues: [],
  },
]);
WithoutMailStory.play = async ({ canvasElement }) => {
  await within(await findDisplayedLayout(canvasElement)).findByText('Pas de messagerie');
};

export const WithoutMail = prepareStory(WithoutMailStory);

const WithoutDataStory = Template.bind({});
WithoutDataStory.args = defaultArgs;
WithoutDataStory.parameters = getMswParameters([domainsReputation[1]]);
WithoutDataStory.play = async ({ canvasElement }) => {
  await within(await findDisplayedLayout(canvasElement)).findByText('Certificat et TLS');
};

export const WithoutData = prepareStory(WithoutDataStory);

// Both layouts are rendered and CSS hides one (so the server renders the right one on any screen), assertions only target the displayed one
async function findDisplayedLayout(canvasElement: HTMLElement): Promise<HTMLElement> {
  const aside = await within(canvasElement).findByRole('complementary', { name: 'Notoriété, sécurité et conformité' });
  const layout = Array.from(aside.children).find(
    (child): child is HTMLElement => child instanceof HTMLElement && window.getComputedStyle(child).display !== 'none'
  );

  if (!layout) {
    throw new Error('no displayed layout has been found');
  }

  return layout;
}

function expectQuantity(elements: HTMLElement[], quantity: number) {
  if (elements.length !== quantity) {
    throw new Error(`${quantity} elements were expected but ${elements.length} have been found`);
  }
}
