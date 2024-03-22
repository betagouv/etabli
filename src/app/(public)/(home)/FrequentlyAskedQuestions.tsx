import { fr } from '@codegouvfr/react-dsfr';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useCallback, useRef, useState } from 'react';

import { linkRegistry } from '@etabli/src/utils/routes/registry';

export function FrequentlyAskedQuestions() {
  const [sourceExplanationOpen, setSourceExplanationOpen] = useState<boolean>(false);
  const sourceExplanationRef = useRef<HTMLDivElement | null>(null); // This is used to scroll to the common accordion

  const focusOnSourceExplanation = useCallback(() => {
    setSourceExplanationOpen(true);

    sourceExplanationRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [setSourceExplanationOpen]);

  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{
        bgcolor: fr.colors.decisions.background.alt.blueFrance.default,
        pt: { xs: 4, md: 4 },
        pb: { xs: 4, md: 8 },
      }}
    >
      <Container>
        <Typography component="h2" variant="h4" sx={{ mt: 1, mb: { xs: 2, sm: 4 } }}>
          Les questions-réponses pour en savoir plus
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Qu&apos;est-ce qu&apos;une &quot;initiative&quot; ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Dans le contexte du projet Établi, une initiative représente soit un service, un produit ou un projet qui est géré par l&apos;État ou
                par une collectivité territoriale.
              </AccordionDetails>
            </Accordion>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Comment une initiative est-elle référencée ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Nous possédons une liste des sites internet d&apos;initiatives publiques, ainsi qu&apos;une autre liste représentant des dépôts de
                code informatique d&apos;initiatives publiques.
                <br />
                <br />
                Pour constituer une fiche, nous allons essayer de créer des groupes (= les fameuses initiatives) entre les sites internet et les
                dépôts. Car les initiatives peuvent être composées de plusieurs sites internet et/ou de plusieurs dépôts.
              </AccordionDetails>
            </Accordion>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Ma propre initiative n&apos;est pas répertoriée, comment faire ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Assurez dans un premier temps que la fiche n&apos;existe pas, en faisant une recherche avec votre nom de domaine et/ou l&apos;adresse
                de votre dépôt.
                <br />
                <br />
                Si vous n&apos;en trouvez aucune dans notre propre annuaire, allez vérifier l&apos;existence de vos sites et dépôts{' '}
                <Link component="span" role="link" color="primary" onClick={focusOnSourceExplanation} className="fr-link" sx={{ cursor: 'pointer' }}>
                  dans les listes sources que nous utilisons, et contribuez-y s&apos;ils sont manquants
                </Link>
                .
              </AccordionDetails>
            </Accordion>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Comment mettre à jour la fiche initiative d&apos;un produit que je gère ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Le flux d&apos;information est unidirectionnel, nous utilisons le contenu des sites internet et des dépôts de code informatique pour
                établir les fiches d&apos;initiatives. Il n&apos;est donc pas possible de &quot;patcher&quot; la description produite dans la fiche
                sur Établi.
                <br />
                <br />
                <ul>
                  <li>
                    S&apos;il manque un site ou un dépôt à votre fiche,{' '}
                    <Link
                      component="span"
                      role="link"
                      color="primary"
                      onClick={focusOnSourceExplanation}
                      className="fr-link"
                      sx={{ cursor: 'pointer' }}
                    >
                      assurez-vous qu&apos;il soit référencé dans nos sources
                    </Link>{' '}
                    ;
                  </li>
                  <li>
                    Si le contenu vous paraît erroné :
                    <ol>
                      <li>
                        Vérifiez déjà que votre fiche initiative référence tous les sites internet et dépôts appropriés pour que notre algorithme ait
                        le plus de contexte possible ;
                      </li>
                      <li>Si applicable, lisez la page d&apos;accueil de votre site internet pour vous assurer qu&apos;elle est assez explicite ;</li>
                      <li>
                        Si applicable, lisez la description de votre dépôt de code ou votre fichier{' '}
                        <Typography component="span" sx={{ fontStyle: 'italic' }}>
                          README.md
                        </Typography>{' '}
                        pour vous assurer qu&apos;elle est assez explicite.
                      </li>
                    </ol>
                  </li>
                </ul>
                À noter que notre synthétisons l&apos;information pour faire les fiches d&apos;initiatives, il est possible que notre processus
                automatisé soit encore à optimiser. Si tel est le cas, merci de nous faire part de vos difficultés.
              </AccordionDetails>
            </Accordion>
            <Accordion
              expanded={sourceExplanationOpen}
              onChange={() => {
                setSourceExplanationOpen(!sourceExplanationOpen);
              }}
              ref={sourceExplanationRef}
              sx={{ boxShadow: 'none' }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Où sont référencés les sites et dépôts de code ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Tout d&apos;abord il faut savoir que nous utilisons des sources externes à Établi (1 pour les sites, et 1 pour les dépôts de code
                informatique). Pourquoi ?
                <ol>
                  <li>Ne pas maintenir cesdites sources nous permet de nous concentrer sur notre coeur de métier ;</li>
                  <li>
                    Avoir 1 source par type de donnée est une volonté de notre part afin que la communauté au sens large se concentre sur
                    l&apos;amélioration de ces seules &quot;sources de vérité&quot;, plutôt que de s&apos;éparpiller.
                  </li>
                </ol>
                <br />
                Vous pouvez vous en servir pour vérifier qu&apos;une initiative manquante sur Établi est bien absente des sources initiales, ou dans
                le cas où vous envisagez d&apos;y référencer de nouveaux éléments. Les sources utilisées étant maintenues dans des dépôts de code
                informatique, n&apos;hésitez pas à demander à vos collègues techniques voire à nous contacter si vous ne savez pas comment les faire
                évoluer.
                <br />
                <br />
                Nos sources :
                <ul>
                  <li>
                    Les sites internet sont extraits de{' '}
                    <Link
                      component={NextLink}
                      href="https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public/-/blob/master/urls.txt?ref_type=heads"
                      underline="none"
                      target="_blank"
                    >
                      la liste de noms de domaine de la sphère publique
                    </Link>{' '}
                    (en plus de ce qui est mentionné dans{' '}
                    <Link
                      component={NextLink}
                      href="https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public/"
                      underline="none"
                      target="_blank"
                    >
                      leur guide de contribution
                    </Link>
                    , il est envisageable d&apos;y ouvrir une simple &quot;issue&quot; pour leur demander une modification) ;
                  </li>
                  <li>
                    Et{' '}
                    <Link component={NextLink} href="https://code.gouv.fr/public/" underline="none" target="_blank">
                      code.gouv.fr
                    </Link>{' '}
                    qui référence les dépôts de code informatique (
                    <Link component={NextLink} href="https://git.sr.ht/~codegouvfr/codegouvfr-sources" underline="none" target="_blank">
                      comme mentionné dans leur guide de contribution
                    </Link>
                    , vous pouvez leur envoyer un email pour toute demande d&apos;évolution).
                  </li>
                </ul>
                <br />
                Pour chaque nouveau référencement, il convient d&apos;attendre quelques jours le temps que nos processus synchronisent les nouvelles
                données.
              </AccordionDetails>
            </Accordion>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>
                  Les modifications d&apos;une initiative n&apos;ont pas eu d&apos;effet sur Établi, pourquoi ?
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                Lorsque vous modifiez des éléments sur votre site internet ou sur votre dépôt de code, cela peut prendre plusieurs jours avant que nos
                processus resynchronisent les dizaines de millier d&apos;initiatives.
                <br />
                <br />
                Si jamais cela vous paraît anormalement long, n&apos;hésitez pas à nous contacter.
              </AccordionDetails>
            </Accordion>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Comment fusionner une initiative répartie sur plusieurs fiches ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                En nous basant sur une liste de noms de domaine et une liste de dépôts de code source, nous avons défini des règles pour les regrouper
                en petits groupes (dits &quot;initiatives&quot;). Il se peut que nos règles soient encore à optimiser, mais en voici quelques-unes qui
                augmentent les chances d&apos;être dans un même groupe :
                <ul>
                  <li>Les sites internet sous un même nom de domaine avec une syntaxe similaire ;</li>
                  <li>Les dépôts de code sous un même compte d&apos;une forge, et avec une syntaxe commune dans leur nom ;</li>
                  <li>Un site internet qui référence le lien vers son dépôt de code ;</li>
                  <li>Un dépôt de code qui référence dans ses métadonnées le lien vers le site internet correspondant.</li>
                </ul>
                Si malgré cela vous n&apos;arrivez pas à fusionner vos fiches, n&apos;hésitez pas à nous contacter pour que l&apos;on investigue la
                situation.
              </AccordionDetails>
            </Accordion>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Est-ce que mes recherches sont sauvegardées ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Nous n&apos;enregistrons pas les recherches, qu&apos;elles soient effectuées via l&apos;annuaire ou par l&apos;assistant.
                <br />
                <br />
                Pour autant, nous vous demandons de ne pas y saisir d&apos;informations sensibles.
              </AccordionDetails>
            </Accordion>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Comment exploiter les données sans l&apos;interface Établi ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Toutes nos données sont mises à disposition dans un format exploitable. Cela vous sera utile si vous développez une fonctionnalité
                basée sur nos données, ou que vous essayez de faire des filtres de recherche que notre interface ne propose pas.
                <br />
                <br />
                Les jeux de données ci-dessous sont générés directement depuis notre base de données avec plus ou moins 1 jour de décalage. La donnée
                que vous exploiterez est donc à jour.
                <br />
                <br />
                <Typography sx={{ fontStyle: 'italic' }}>
                  Pour les formats tableurs, plusieurs entités de même type pour une même initiative (sites internet, dépôts de code, cas
                  d&apos;utilisation et outils) sont regroupées dans une même cellule mais séparées par des retours à la ligne.
                </Typography>
                <br />
                <ul>
                  <li>
                    <Typography component="span" sx={{ fontWeight: 600 }}>
                      Fichier JSON
                    </Typography>
                    <ul>
                      <li>
                        <Link
                          component={NextLink}
                          href={`${linkRegistry.get('dataset', { technicalName: 'initiatives.json' })}?format=raw`}
                          underline="none"
                          target="_blank"
                        >
                          Format technique
                        </Link>
                      </li>
                      <li>
                        <Link
                          component={NextLink}
                          href={linkRegistry.get('dataset', { technicalName: 'initiatives.json' })}
                          underline="none"
                          target="_blank"
                        >
                          Format avec champs techniques traduits
                        </Link>
                      </li>
                    </ul>
                  </li>
                  <li>
                    <Typography component="span" sx={{ fontWeight: 600 }}>
                      Fichier XLSX
                    </Typography>{' '}
                    <Typography component="span" sx={{ fontStyle: 'italic' }}>
                      (pratique pour une exploration via logiciel type Excel)
                    </Typography>
                    <ul>
                      <li>
                        <Link
                          component={NextLink}
                          href={`${linkRegistry.get('dataset', { technicalName: 'initiatives.xlsx' })}?format=raw`}
                          underline="none"
                          target="_blank"
                        >
                          Format technique
                        </Link>
                      </li>
                      <li>
                        <Link
                          component={NextLink}
                          href={linkRegistry.get('dataset', { technicalName: 'initiatives.xlsx' })}
                          underline="none"
                          target="_blank"
                        >
                          Format avec colonnes et champs techniques traduits
                        </Link>
                      </li>
                    </ul>
                  </li>
                  <li>
                    <Typography component="span" sx={{ fontWeight: 600 }}>
                      Fichier CSV
                    </Typography>
                    <ul>
                      <li>
                        <Link
                          component={NextLink}
                          href={`${linkRegistry.get('dataset', { technicalName: 'initiatives.csv' })}?format=raw`}
                          underline="none"
                          target="_blank"
                        >
                          Format technique
                        </Link>
                      </li>
                      <li>
                        <Link
                          component={NextLink}
                          href={linkRegistry.get('dataset', { technicalName: 'initiatives.csv' })}
                          underline="none"
                          target="_blank"
                        >
                          Format avec colonnes et champs techniques traduits
                        </Link>
                      </li>
                    </ul>
                  </li>
                </ul>
                <Typography sx={{ fontStyle: 'italic' }}>
                  Notez que si vous êtes le premier de la journée à télécharger le jeu de données, il se peut que cela prenne quelques secondes au vu
                  du grand nombre d&apos;initiatives à formater dans le fichier.
                </Typography>
              </AccordionDetails>
            </Accordion>
            <Accordion sx={{ boxShadow: 'none' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Quels sont les prochaines améliorations ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                La réalisation des prochains objectifs va forcément dépendre de l&apos;impact que ce service aura auprès des agents et des citoyens.
                Mais nous avons quelques idées :
                <ul>
                  <li>Analyser si les sites internets possèdent des mentions légales et la déclaration d&apos;accessibilité ;</li>
                  <li>Analyser si les dépôts de code déclarent une licence d&apos;utilisation ;</li>
                </ul>
                Si vous avez des idées pour nous, nous vous invitons à les partager via la messagerie !
              </AccordionDetails>
            </Accordion>
          </Grid>
        </Grid>
      </Container>
    </Container>
  );
}
