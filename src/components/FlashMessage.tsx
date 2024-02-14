import { Notice } from '@codegouvfr/react-dsfr/Notice';
import Button from '@mui/lab/LoadingButton';

import { useLiveChat } from '@etabli/src/components/live-chat/useLiveChat';

export interface FlashMessageProps {
  appMode?: string;
  nodeEnv?: string;
}

export function FlashMessage(props: FlashMessageProps) {
  const { showLiveChat, isLiveChatLoading } = useLiveChat();

  if (props.nodeEnv === 'production') {
    return (
      <Notice
        title={
          <>
            Ce service vient tout juste d&apos;être lancé, merci de nous faire vos retours dans la section{' '}
            <Button onClick={showLiveChat} loading={isLiveChatLoading} size="small" variant="contained" sx={{ ml: 1 }}>
              Support
            </Button>
          </>
        }
        isClosable
        style={{
          fontSize: '0.9rem',
          paddingTop: '0.5rem',
          paddingBottom: '0.5rem',
        }}
      />
    );
  }

  return null;
}
