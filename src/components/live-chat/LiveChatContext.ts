import { createContext } from 'react';

export interface LiveChatContextType {
  showLiveChat: () => void;
  isLiveChatLoading: boolean;
}

export const LiveChatContext = createContext<LiveChatContextType>({
  showLiveChat: () => {
    throw new Error('the LiveChatProvider is missing');
  },
  isLiveChatLoading: false,
});
