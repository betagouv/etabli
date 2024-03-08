import { Notice } from '@codegouvfr/react-dsfr/Notice';

export interface FlashMessageProps {
  appMode?: string;
  nodeEnv?: string;
}

export function FlashMessage(props: FlashMessageProps) {
  if (props.nodeEnv === 'production') {
    return (
      <Notice
        title={<>Ce service vient tout juste d&apos;être lancé, merci de nous faire vos retours dans la section</>}
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
