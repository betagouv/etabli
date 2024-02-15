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

export function FrequentlyAskedQuestions() {
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
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Qu&apos;est-ce qu&apos;une &quot;initiative&quot; ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Dans le contexte du projet Établi, une initiative représente soit un service, un produit ou un projet qui est géré par l&apos;État ou
                par une collectivité territoriale.
              </AccordionDetails>
            </Accordion>
            <Accordion>
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
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Ma propre initiative n&apos;est pas répertoriée, comment faire ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Assurez dans un premier temps que la fiche n&apos;existe pas, en faisant une recherche avec votre nom de domaine et/ou l&apos;adresse
                de votre dépôt.
                <br />
                <br />
                Si vous ne trouvez toujours rien, sachez qu&apos;il est indispensable d&apos;avoir listé votre initiative dans les sources que
                l&apos;on utilise :
                <ul>
                  <li>
                    Pour les sites internet, se référer à{' '}
                    <Link
                      component={NextLink}
                      href="https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public/"
                      variant="subtitle2"
                      underline="none"
                      target="_blank"
                    >
                      la liste de noms de domaine de la sphère publique
                    </Link>{' '}
                    ;
                  </li>
                  <li>
                    Pour les dépôts de code informatique, se référer à la liste{' '}
                    <Link component={NextLink} href="https://code.gouv.fr/public/" variant="subtitle2" underline="none" target="_blank">
                      code.gouv.fr
                    </Link>
                    qui est faite{' '}
                    <Link
                      component={NextLink}
                      href="https://git.sr.ht/~codegouvfr/codegouvfr-sources"
                      variant="subtitle2"
                      underline="none"
                      target="_blank"
                    >
                      par déclaration des comptes sur forge
                    </Link>
                    (que ce soit GitHub, GitLab...).
                  </li>
                </ul>
                Une fois fait, il convient d&apos;attendre quelques jours le temps que nos processus synchronisent les nouvelles données.
              </AccordionDetails>
            </Accordion>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Comment mettre à jour la fiche initiative d&apos;un produit que je gère ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                Le flux d&apos;information est unidirectionnel, nous utilisons le contenu des sites internet et des dépôts de code informatique pour
                établir les fiches d&apos;initiatives. Il n&apos;est donc pas possible de &quot;patcher&quot; la description produite dans la fiche
                sur Établi.
                <br />
                <br />
                Si le contenu vous paraît erroné :
                <ol>
                  <li>
                    Vérifiez déjà que votre fiche initiative référence tous les sites internet et dépôts appropriés pour que notre algoritme ait le
                    plus de contexte possible ;
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
                À noter que notre synthétisons l&apos;information pour faire les fiches d&apos;initiatives, il est possible que notre processus
                automatisé soit encore à optimiser. Si tel est le cas, merci de nous part de vos difficultés.
              </AccordionDetails>
            </Accordion>
            <Accordion>
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
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Comment fusionner une initiative répartie sur plusieurs fiches ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                En nous basant sur une liste de noms de domaine et une liste de dépôts de code source, nous avons défini des règles pour les regrouper
                en petits groupes (dits &quot;initiatives&quot;). Il se peut que nos règles soient encore à optimiser, mais en voici quelques unes qui
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
            <Accordion>
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
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Quels sont les prochaines améliorations dans Établi ?</Typography>
              </AccordionSummary>
              <AccordionDetails>
                La réalisation des prochains objectifs va forcément dépendre de l&apos;impact que ce service aura auprès des agents et des citoyens.
                Mais nous avons quelques idées :
                <ul>
                  <li>Analyser si les sites internets possèdent des mentions légales et la déclaration d&apos;accessibilité ;</li>
                  <li>Analyser si les dépôts de code déclarent une licence d&apos;utilisation ;</li>
                  <li>Mettre à disposition une API technique et la documenter afin que les données soient réutilisables par des services tiers.</li>
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
