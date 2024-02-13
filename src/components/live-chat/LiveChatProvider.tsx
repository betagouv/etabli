'use client';

import { Crisp } from 'crisp-sdk-web';
import { PropsWithChildren, useCallback, useEffect, useState } from 'react';

import { LiveChatContext } from '@etabli/src/components/live-chat/LiveChatContext';

const crispWebsiteId: string = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID || process.env.CRISP_WEBSITE_ID || 'no_crisp_settings';

export const LiveChatProvider = ({ children }: PropsWithChildren) => {
  // [IMPORTANT] When using `useSearchParams()` is breaks the the vanilla DSFR to add attributes to the `html` tag
  // resulting in the `react-dsfr` not able to initialize... it's an odd case, things are missing for mystic reasons
  // It's only happening when starting a built bundle, not in development...
  // Just using more below a vanilla frontend look up on search params
  // const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const showLiveChat = useCallback(async () => {
    // Even if it failed retrieving information for this user, let the user contact the support
    Crisp.chat.open();
  }, []);

  useEffect(() => {
    // This `sessionIdToResume` definition is a workaround, see at the top of the component for the reason
    let sessionIdToResume = null;
    if (window) {
      const searchParams = new URLSearchParams(window.location.search);
      sessionIdToResume = searchParams.get('crisp_sid');
    }

    Crisp.configure(crispWebsiteId, {
      autoload: !!sessionIdToResume, // If the user comes from a Crisp email to reply to the session, we load Crisp and this one should handle retrieving previous session
      cookieExpire: 7 * 24 * 60 * 60, // Must be in seconds, currently 7 days instead of the default 6 months
      sessionMerge: true,
      locale: 'fr',
    });

    if (sessionIdToResume) {
      showLiveChat();
    }

    return () => {
      // Crisp should allow us to destroy the instance (for Storybook for example)
      // Ref: https://stackoverflow.com/questions/71967230/how-to-destroy-crisp-chat
    };
  }, [showLiveChat]);

  return (
    <>
      <LiveChatContext.Provider
        value={{
          showLiveChat: showLiveChat,
          isLiveChatLoading: isLoading,
        }}
      >
        {children}
      </LiveChatContext.Provider>
    </>
  );
};
