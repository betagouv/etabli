// import { fr } from '@codegouvfr/react-dsfr';
import ovoidSprite from '@gouvfr/dsfr/dist/artwork/background/ovoid.svg';
import technicalErrorSprite from '@gouvfr/dsfr/dist/artwork/pictograms/system/technical-error.svg';
import Button from '@mui/lab/LoadingButton';
import Grid from '@mui/material/Grid';
import NextLink from 'next/link';
import React from 'react';

import { useLiveChat } from '@etabli/src/components/live-chat/useLiveChat';
import { centeredErrorContainerGridProps } from '@etabli/src/utils/grid';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

// Simple workaround until Next.js implement the errors into the appDir and not into `pages`
// At that time we had this error: `SyntaxError: Unexpected token 'export'`
const fr = {
  cx(...args: string[]): string {
    return args.join(' ');
  },
};

export interface ErrorPageProps {
  title: string;
  technicalTitle: string;
  summary: string;
  description: () => JSX.Element;
  buttons: (() => JSX.Element)[];
}

export function ErrorPage(props: ErrorPageProps) {
  const Description = props.description;

  return (
    <Grid container {...centeredErrorContainerGridProps}>
      <div role="alert" className={fr.cx('fr-grid-row', 'fr-grid-row--gutters', 'fr-grid-row--middle', 'fr-grid-row--center')}>
        <div className={fr.cx('fr-py-0', 'fr-col-12', 'fr-col-md-6')}>
          <h1>{props.title}</h1>
          <p className={fr.cx('fr-text--sm', 'fr-mb-3w')}>{props.technicalTitle}</p>
          <p className={fr.cx('fr-text--lead', 'fr-mb-3w')}>{props.summary}</p>
          <p className={fr.cx('fr-text--sm', 'fr-mb-5w')}>
            <Description />
          </p>
          {!!props.buttons.length && (
            <ul className={fr.cx('fr-btns-group', 'fr-btns-group--inline-md')} style={{ marginLeft: 0, marginRight: 0 }}>
              {props.buttons.map((Button, index) => (
                <li key={index}>
                  <Button />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={fr.cx('fr-col-12', 'fr-col-md-3', 'fr-col-offset-md-1', 'fr-px-6w', 'fr-px-md-0', 'fr-py-0')}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={fr.cx('fr-responsive-img')}
            aria-hidden="true"
            width="160"
            height="200"
            viewBox="0 0 160 200"
          >
            <use className={fr.cx('fr-artwork-motif')} href={`${ovoidSprite.src}#artwork-motif`}></use>
            <use className={fr.cx('fr-artwork-background')} href={`${ovoidSprite.src}#artwork-background`}></use>
            <g transform="translate(40, 60)">
              <use className={fr.cx('fr-artwork-decorative')} href={`${technicalErrorSprite.src}#artwork-decorative`}></use>
              <use className={fr.cx('fr-artwork-minor')} href={`${technicalErrorSprite.src}#artwork-minor`}></use>
              <use className={fr.cx('fr-artwork-major')} href={`${technicalErrorSprite.src}#artwork-major`}></use>
            </g>
          </svg>
        </div>
      </div>
    </Grid>
  );
}

export const error404Props: ErrorPageProps = {
  title: 'Page non trouvée',
  technicalTitle: 'Erreur 404',
  summary: 'La page que vous cherchez est introuvable. Excusez-nous pour la gène occasionnée.',
  description: () => (
    <>
      Si vous avez tapé l&apos;adresse web dans le navigateur, vérifiez qu&apos;elle est correcte. La page n&apos;est peut-être plus disponible.
      <br />
      Dans ce cas, pour continuer votre visite vous pouvez consulter notre page d&apos;accueil, ou effectuer une recherche avec notre moteur de
      recherche en haut de page.
      <br />
      Sinon contactez-nous pour que l&apos;on puisse vous rediriger vers la bonne information.
    </>
  ),
  buttons: [
    () => (
      <Button component={NextLink} href={linkRegistry.get('home', undefined)} size="large" variant="contained">
        Page d&apos;accueil
      </Button>
    ),
  ],
};

export const error500Props: ErrorPageProps = {
  title: 'Erreur inattendue',
  technicalTitle: 'Erreur 500',
  summary: 'Essayez de rafraichir la page ou bien ressayez plus tard.',
  description: () => <>Désolé, le service rencontre un problème, nous travaillons pour le résoudre le plus rapidement possible.</>,
  buttons: [
    () => {
      const { showLiveChat, isLiveChatLoading } = useLiveChat();

      return (
        <Button onClick={showLiveChat} loading={isLiveChatLoading} size="large" variant="contained">
          Contactez-nous
        </Button>
      );
    },
  ],
};

export const error503Props: ErrorPageProps = {
  title: 'Service indisponible',
  technicalTitle: 'Erreur 503',
  summary: 'Notre service rencontre un problème, nous travaillons pour le résoudre le plus rapidement possible.',
  description: () => (
    <>Merci de réessayer plus tard ou de vous rendre sur nos réseaux sociaux, vous serez bientôt en mesure de réutiliser le service.</>
  ),
  buttons: [],
};
