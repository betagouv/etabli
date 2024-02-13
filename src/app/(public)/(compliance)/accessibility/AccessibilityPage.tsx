// The `generated-statement.html` file has been generated on https://betagouv.github.io/a11y-generateur-declaration/
import Alert from '@mui/material/Alert';
import Container from '@mui/material/Container';

import statementContent from '@etabli/src/app/(public)/(compliance)/accessibility/generated-statement.html';

const cleanStatementContent = statementContent.replace('<!DOCTYPE html>', '');

function createMarkup() {
  return { __html: cleanStatementContent };
}

export function AccessibilityPage() {
  return (
    <Container
      sx={{
        py: 6,
      }}
    >
      <Alert severity="info" sx={{ mb: 3 }}>
        Aucun audit d&apos;accessibilité RGAA n&apos;a pour l&apos;instant été fait d&apos;où la non-conformité du produit mentionnée ci-dessous. Pour
        autant nous avons effectué un &quot;mini-audit&quot; d&apos;accessibilité au sein de la communauté beta.gouv en avril 2023, et les résultats
        se sont révélés très encourageants. Nous avons quelques points à ajuster dans le futur mais l&apos;outil répond déjà à beaucoup de critères.
      </Alert>
      <div dangerouslySetInnerHTML={createMarkup()}></div>
    </Container>
  );
}
