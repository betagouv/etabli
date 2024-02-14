import Button from '@mui/lab/LoadingButton';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Meta, StoryFn } from '@storybook/react';
import Image from 'next/image';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { IntroductionContainer } from '@etabli/src/components/IntroductionContainer';

type ComponentType = typeof IntroductionContainer;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/IntroductionContainer',
  component: IntroductionContainer,
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = (args) => {
  return <IntroductionContainer {...args} />;
};

const NormalStory = Template.bind({});
NormalStory.args = {
  left: (
    <Box
      sx={{
        px: 4,
        py: 3,
        textAlign: { xs: 'center', md: 'left' },
      }}
    >
      <Typography variant="h2" sx={{ my: 2, maxWidth: 500 }}>
        Esse sit laborum
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 500 }}>
        Aut aut iure minus sint perspiciatis dolorem iusto molestias ullam.
      </Typography>
      <Button onClick={() => {}} size="large" variant="contained" sx={{ mb: 3 }}>
        Ipsum
      </Button>
    </Box>
  ),
  right: (
    <Image
      src="https://via.placeholder.com/400x350"
      width={400}
      height={350}
      alt=""
      style={{
        width: '100%',
        maxHeight: '350px',
        objectFit: 'contain',
        objectPosition: 'left center',
      }}
    />
  ),
};
NormalStory.parameters = {};

export const Normal = prepareStory(NormalStory);
