import { Notice } from '@codegouvfr/react-dsfr/Notice';
import Link from '@mui/material/Link';
import NextLink from 'next/link';

export interface FlashMessageProps {
  appMode?: string;
  nodeEnv?: string;
}

export function FlashMessage(props: FlashMessageProps) {
  if (props.appMode === 'dev' && props.nodeEnv === 'production') {
    return (
      <Notice
        title={
          <>
            Vous êtes actuellement sur la version de test interne. La version grand public est accessible sur{' '}
            <Link component={NextLink} href="https://www.mediateur-public.fr" color="inherit">
              www.mediateur-public.fr
            </Link>
          </>
        }
        isClosable
      />
    );
  }

  return null;
}
