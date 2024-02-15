import { fr } from '@codegouvfr/react-dsfr';
import EmojiPeopleIcon from '@mui/icons-material/EmojiPeople';
import GroupsIcon from '@mui/icons-material/Groups';
import HubIcon from '@mui/icons-material/Hub';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';

import { Widget } from '@etabli/src/app/(public)/(home)/Widget';

export function KeyReasons() {
  return (
    <Container sx={{ py: { xs: 4, md: 8 } }}>
      <Typography component="h2" variant="h4" sx={{ mt: 1, mb: { xs: 2, sm: 4 } }}>
        Quelques bonnes raisons d&apos;explorer avec Établi
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <Widget icon={<HubIcon fontSize="small" />} title="Mutualiser l'effort de réalisation">
            <Typography variant="body2" color="text.secondary">
              Établi référence chaque initiative avec ses cas d&apos;utilisation métiers, ses cas d&apos;utilisation fonctionnels, et ses principaux
              outils.
              <br />
              <br />
              L&apos;idée est qu&apos;au moment de réaliser vous-même une initiative ou une fonctionnalité, vous puissiez rechercher celles similaires
              afin de ne pas réinventer la roue.
            </Typography>
          </Widget>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Widget icon={<GroupsIcon fontSize="small" />} title="Échanger et apprendre de ses pairs">
            <Typography variant="body2" color="text.secondary">
              Au-delà de la réutilisation, si vous trouvez des initiatives très similaires aux vôtres nous vous conseillons de rentrer en contact avec
              leur équipe.
              <br />
              <br />
              Vos compétences et expériences respectives sont précieuses, vous pourrez sûrement en apprendre davantage.
            </Typography>
          </Widget>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Widget icon={<EmojiPeopleIcon fontSize="small" />} title="Être guidé en tant qu'utilisateur final">
            <Typography variant="body2" color="text.secondary">
              Il est parfois difficile de savoir si le service public propose ou non tel projet ou tel service.
              <br />
              <br />
              Nous avons bon espoir qu&apos;Établi pourra aider à la découvrabilité des initiatives publiques tant pour les citoyens que pour les
              agents publics.
            </Typography>
          </Widget>
        </Grid>
      </Grid>
    </Container>
  );
}
