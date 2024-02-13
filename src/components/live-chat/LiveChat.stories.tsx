import { Meta, StoryFn } from '@storybook/react';

import { StoryHelperFactory } from '@etabli/.storybook/helpers';
import { LiveChatProvider } from '@etabli/src/components/live-chat/LiveChatProvider';
import { useLiveChat } from '@etabli/src/components/live-chat/useLiveChat';

type ComponentType = any;
const { generateMetaDefault, prepareStory } = StoryHelperFactory<ComponentType>();

export default {
  title: 'Components/LiveChat',
  ...generateMetaDefault({
    parameters: {},
  }),
} as Meta<ComponentType>;

const Template: StoryFn<ComponentType> = () => {
  const { showLiveChat, isLiveChatLoading } = useLiveChat();

  // useEffect(() => {
  //   showLiveChat();
  // }, [showLiveChat]);

  return (
    <>
      <h6>
        LiveChat page (it won&apos;t init completely since we don&apos;t have a reliable website ID for local environments... and they don&apos;t have
        an in-library &quot;sandbox/debug&quot; mode)
      </h6>
      <p>
        [IMPORTANT] For now there is no way to hide Crisp when switching to another story... We did try to remove `.crisp-client` from the DOM but due
        to this sometimes it won&apos;t show up a new time. Giving up for now...
      </p>
    </>
  );
};

const NormalStory = Template.bind({});
NormalStory.args = {};
NormalStory.parameters = {};
NormalStory.decorators = [
  (Story: StoryFn) => {
    return (
      <LiveChatProvider>
        <Story />
      </LiveChatProvider>
    );
  },
];
// NormalStory.play = async ({ canvasElement }) => {
//   await screen.findByRole('button');
// };

export const Normal = prepareStory(NormalStory);
