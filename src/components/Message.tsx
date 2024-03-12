import MuiAvatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Markdown from 'markdown-to-jsx';

import assistantAvatar from '@etabli/src/assets/images/assistant_avatar.png';
import { Avatar } from '@etabli/src/components/Avatar';
import { MessageAuthorSchema, MessageSchemaType } from '@etabli/src/models/entities/assistant';

export interface MessageProps {
  message: MessageSchemaType;
}

export function Message(props: MessageProps) {
  return (
    <Box sx={{ display: 'flex', gap: 2 }}>
      <Box sx={{ display: 'inline-block', width: { sm: 32, md: 40 }, flexShrink: 0, overflow: 'hidden' }}>
        <Box sx={{ width: 'fit-content', margin: 'auto', mt: '5px' }}>
          {props.message.author === MessageAuthorSchema.Values.ASSISTANT ? (
            <Avatar fullName="Assistant" src={assistantAvatar.src} size={32} />
          ) : (
            <MuiAvatar sx={{ width: 32, height: 32, fontSize: 32 / 2, bgcolor: 'var(--background-contrast-brown-opera-active)' }} />
          )}
        </Box>
      </Box>
      <Box
        sx={{
          display: 'inline-block',
          width: 'auto',
          whiteSpace: 'pre-wrap !important',
          wordBreak: 'break-word !important', // Needed in case of word/sentence bigger than parent width
        }}
      >
        <Markdown>{props.message.content}</Markdown>
      </Box>
    </Box>
  );
}
