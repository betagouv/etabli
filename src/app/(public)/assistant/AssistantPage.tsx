'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { push } from '@socialgouv/matomo-next';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useUpdateEffect } from 'react-use';
import { v4 as uuidv4 } from 'uuid';

import { RequestAssistantForm } from '@etabli/src/app/(public)/assistant/RequestAssistantForm';
import assistantAvatar from '@etabli/src/assets/images/assistant_avatar.png';
import { trpc } from '@etabli/src/client/trpcClient';
import { Avatar } from '@etabli/src/components/Avatar';
import { Message } from '@etabli/src/components/Message';
import { MessageAuthorSchema, MessageSchema, MessageSchemaType, SessionAnswerChunkSchemaType } from '@etabli/src/models/entities/assistant';

export const AssistantPageContext = createContext({
  ContextualRequestAssistantForm: RequestAssistantForm,
});

export interface AssistantPageProps {
  prefilledMessages?: MessageSchemaType[];
}

export function AssistantPage(props: AssistantPageProps) {
  const { ContextualRequestAssistantForm } = useContext(AssistantPageContext);

  const [sessionId, setSessionId] = useState<string>(() => uuidv4());
  const [messages, setMessages] = useState<MessageSchemaType[]>(() => props.prefilledMessages || []);
  const inputContainerRef = useRef<HTMLDivElement | null>(null); // This is used to scroll to ease the reading

  useUpdateEffect(() => {
    // Try to understand how many times people reset the session
    push(['trackEvent', 'assistant', 'resetSession']);
  }, [sessionId]);

  const handleNewMessageChunk = (data: SessionAnswerChunkSchemaType) => {
    // If not for the current session (for any reason, ignore)
    if (data.sessionId !== sessionId) {
      return;
    }

    // Modify existing message if any
    let message = messages.find((message) => message.id === data.messageId);
    if (!message) {
      message = {
        id: data.messageId,
        author: MessageAuthorSchema.Values.ASSISTANT,
        content: '',
        complete: false,
      };

      messages.push(message);
    }

    // If the message has been completed by the mutation in the meantime, skip this chunk
    if (!message.complete) {
      message.content += data.chunk;
    }

    // Needed to re-render
    setMessages([...messages]);

    // Scroll in case the user was at the top while typing, or in case the new chunk is producing a new line
    inputContainerRef.current?.scrollIntoView({ behavior: 'instant' });
  };

  const restartSession = () => {
    // The subscription of tRPC would will automatically due to state change
    setSessionId(uuidv4());
    setMessages([]);
  };

  return (
    <Container
      sx={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        py: 3,
      }}
    >
      <Box sx={{ flex: 1, minHeight: 400 }}>
        {messages.length > 0 ? (
          <Box>
            {messages.map((message) => (
              <Box key={message.id} sx={{ py: '0.75rem' }}>
                <Message message={message} />
              </Box>
            ))}
          </Box>
        ) : (
          <Grid container spacing={2} justifyContent="center" sx={{ height: '100%' }}>
            <Grid item xs={12} sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <Alert severity="info" sx={{ mb: 3 }}>
                {/* TODO: remove when appropriate */}
                Dû à notre phase de tests, nous avons limité la connaissance de notre assistant à 2000 initiatives sur les 40 000 possibles. Nous
                avons principalement référencé celles liées au gouvernement, mais nous les référencerons toutes sous peu.
              </Alert>
              <Box sx={{ flex: 1 }} />
              <Box sx={{ textAlign: 'center', mt: 1, mb: { xs: 2, sm: 4 } }}>
                <Avatar fullName="Assistant" src={assistantAvatar.src} size={48} sx={{ margin: 'auto' }} />
                <Typography component="div" variant="h5" sx={{ mt: { xs: 1, sm: 2 } }}>
                  Je vais vous aider à explorer les initiatives publiques numériques.
                  <br />
                  Que recherchez-vous ?
                </Typography>
              </Box>
              <Box sx={{ flex: 1 }} />
              <Typography component="span" variant="body2" sx={{ textAlign: 'center', mt: 1 }}>
                L&apos;assistant virtuel peut être inexact voire se tromper, faites-nous vos retours pour que l&apos;équipe Établi puisse
                l&apos;améliorer.
              </Typography>
            </Grid>
          </Grid>
        )}
      </Box>
      <Box sx={{ bgcolor: 'var(--background-default-grey)', position: 'sticky', bottom: '0', pt: 1 }} ref={inputContainerRef}>
        <Grid
          container
          spacing={2}
          sx={{
            bgcolor: 'var(--background-default-grey)',
            p: '1rem',
            pr: 0, // This padding is added by another block
          }}
        >
          <Grid item xs={12}>
            <ContextualRequestAssistantForm
              prefill={{ sessionId: sessionId }}
              onNewMessageChunk={handleNewMessageChunk}
              onNewMessage={(newMessage) => {
                // todo: force replace all ...messages?
                let existingMessage = messages.find((message) => message.id === newMessage.id);
                if (!existingMessage) {
                  // It's possible the message does not already exist if it's a user message or if the chunks through subscription didn't worked
                  messages.push(newMessage);
                } else {
                  existingMessage.complete = newMessage.complete;
                  existingMessage.content = newMessage.content;
                }

                // Needed to re-render
                setMessages([...messages]);

                // Scroll in case the user was at the top while typing
                inputContainerRef.current?.scrollIntoView({ behavior: 'instant' });
              }}
              canBeReset={messages.length > 0}
              onResetSession={restartSession}
            />
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
