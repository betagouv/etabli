import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useState } from 'react';

import agentsStatementContent from '@etabli/src/app/(public)/(compliance)/terms-of-use/for-agents/content.transformed.html';
import othersStatementContent from '@etabli/src/app/(public)/(compliance)/terms-of-use/for-others/content.transformed.html';

function createAgentsMarkup() {
  return { __html: agentsStatementContent };
}

function createOthersMarkup() {
  return { __html: othersStatementContent };
}

type ContentType = 'others' | 'agents';

export function TermsOfUsePage() {
  const [contentType, setContentType] = useState<ContentType>('others');

  const handleChange = (event: React.MouseEvent<HTMLElement>, newContentType: ContentType | null) => {
    if (newContentType) {
      setContentType(newContentType);
    }
  };

  return (
    <Container
      sx={{
        py: 6,
      }}
    >
      <Box
        sx={{
          textAlign: 'center',
        }}
      >
        <ToggleButtonGroup
          value={contentType}
          exclusive
          onChange={handleChange}
          aria-label="personne cible"
          sx={{
            mt: 4,
            mb: 8,
          }}
        >
          <ToggleButton value="others" color="primary">
            Pour les utilisateurs
          </ToggleButton>
          <ToggleButton value="agents" color="primary">
            Pour les médiateurs
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {contentType === 'others' ? (
        <div dangerouslySetInnerHTML={createAgentsMarkup()}></div>
      ) : (
        <div dangerouslySetInnerHTML={createOthersMarkup()}></div>
      )}
    </Container>
  );
}
