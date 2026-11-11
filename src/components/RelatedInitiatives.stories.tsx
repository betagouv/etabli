import { Meta, StoryFn } from '@storybook/nextjs';
import { within } from 'storybook/test';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { RelatedInitiatives } from '@etabli/src/components/RelatedInitiatives';

type ComponentType = typeof RelatedInitiatives;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/RelatedInitiatives',
  component: RelatedInitiatives,
  ...generateMetaDefault({
    parameters: {
      layout: 'fullscreen',
    },
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <RelatedInitiatives {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = {
  // Every combination of websites and repositories
  initiatives: [
    {
      id: 'b4d7a2c1-0000-4000-8000-000000000001',
      name: 'Label bas carbone',
      websites: ['https://label-bas-carbone.ecologie.gouv.fr/'],
      repositories: [],
    },
    {
      id: 'b4d7a2c1-0000-4000-8000-000000000002',
      name: 'Accueil | Ministère de la Transition écologique, de la Biodiversité et des Négociations internationales',
      websites: ['https://www.ecologie.gouv.fr', 'https://contact.ecologie.gouv.fr', 'https://presse.ecologie.gouv.fr'],
      repositories: ['https://github.com/MTES-MCT/site-ecologie', 'https://github.com/MTES-MCT/contact'],
    },
    {
      id: 'b4d7a2c1-0000-4000-8000-000000000003',
      name: 'Outil de suivi des contrôles',
      websites: [],
      repositories: ['https://github.com/MTES-MCT/suivi-controles'],
    },
    {
      id: 'b4d7a2c1-0000-4000-8000-000000000004',
      name: 'Bibliothèque de composants',
      websites: [],
      repositories: ['https://github.com/MTES-MCT/composants', 'https://gitlab.com/MTES-MCT/composants-legacy'],
    },
    {
      id: 'b4d7a2c1-0000-4000-8000-000000000005',
      name: 'consultation-pnacc.ecologie.gouv.fr',
      websites: ['https://consultation-pnacc.ecologie.gouv.fr'],
      repositories: ['https://github.com/MTES-MCT/consultation'],
    },
  ],
};
NormalStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByRole('heading', { level: 2, name: /autres initiatives/i });
};

export const Normal = prepareStory(NormalStory, {});

const SingleStory = Template.bind({});
SingleStory.args = {
  initiatives: [
    {
      id: 'b4d7a2c1-0000-4000-8000-000000000006',
      name: 'CHU de Rennes',
      websites: ['https://www.chu-rennes.fr'],
      repositories: [],
    },
  ],
};
SingleStory.play = async ({ canvasElement }) => {
  await within(canvasElement).findByRole('link', { name: /chu de rennes/i });
};

export const Single = prepareStory(SingleStory, {});
