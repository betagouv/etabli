import { useContext } from 'react';

import { LiveChatContext } from '@etabli/src/components/live-chat/LiveChatContext';

export const useLiveChat = () => {
  return useContext(LiveChatContext);
};
