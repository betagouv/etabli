'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SendIcon from '@mui/icons-material/Send';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { push } from '@socialgouv/matomo-next';
import assert from 'assert';
import { Mutex } from 'locks';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';

import { BaseForm } from '@etabli/src/components/BaseForm';
import { RequestAssistantPrefillSchemaType, RequestAssistantSchema, RequestAssistantSchemaType } from '@etabli/src/models/actions/assistant';
import {
  MessageAuthorSchema,
  MessageSchema,
  MessageSchemaType,
  SessionAnswerChunkSchema,
  SessionAnswerChunkSchemaType,
} from '@etabli/src/models/entities/assistant';
import { internalServerErrorError } from '@etabli/src/models/entities/errors';
import { mockBaseUrl, shouldTargetMock } from '@etabli/src/server/mock/environment';
import { getBaseUrl } from '@etabli/src/utils/url';

const textDecoder = new TextDecoder();

export interface RequestAssistantFormProps {
  prefill?: RequestAssistantPrefillSchemaType;
  onNewMessageChunk?: (data: SessionAnswerChunkSchemaType) => void;
  onNewMessage?: (message: MessageSchemaType) => void;
  onResetSession?: () => void;
  canBeReset?: boolean;
}

export function RequestAssistantForm(props: RequestAssistantFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [mutex] = useState<Mutex>(() => new Mutex());

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
    reset,
  } = useForm<RequestAssistantSchemaType>({
    resolver: zodResolver(RequestAssistantSchema),
    defaultValues: props.prefill,
  });

  useEffect(() => {
    if (props.prefill?.sessionId) {
      setValue('sessionId', props.prefill.sessionId);
    }
  }, [props.prefill?.sessionId, setValue]);

  const onSubmit = async (input: RequestAssistantSchemaType) => {
    // If it's already running, quit
    if (!mutex.tryLock()) {
      return;
    }

    try {
      // Send the written message to the parent so it can display it
      if (props.onNewMessage) {
        props.onNewMessage(
          MessageSchema.parse({
            id: uuidv4(),
            author: MessageAuthorSchema.Values.USER,
            content: input.message,
            complete: true,
          })
        );
      }

      // Note: we keep it simple, in case of error the parent component will still display what has been sent
      const response = await fetch(`${shouldTargetMock ? mockBaseUrl : getBaseUrl()}/api/request-assistant`, {
        method: 'post',
        headers: {
          'Content-Type': 'application/json', // Assurez-vous de spécifier le type de contenu correct
        },
        body: JSON.stringify(input),
      });

      if (response.status !== 200) {
        throw internalServerErrorError;
      }

      // Track sending messages but without the query
      push(['trackEvent', 'assistant', 'sendMessage', 'words', input.message.split(' ').length]);

      assert(response.body);
      const reader = response.body.getReader();

      // Since the answer should be streamed we don't want to keep the input until the end of the generation
      // (it may force the user to copy/paste in case of incomplete answer, but for now it's acceptable)
      reset({
        sessionId: props.prefill?.sessionId, // Needed to not get back to the `sessionId` from default values
        message: '',
      });

      const answerMessageId = uuidv4();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        props.onNewMessageChunk &&
          props.onNewMessageChunk(
            SessionAnswerChunkSchema.parse({
              sessionId: input.sessionId,
              messageId: answerMessageId,
              chunk: textDecoder.decode(value),
            })
          );
      }
    } finally {
      // Unlock to allow a new submit
      mutex.unlock();
    }
  };

  return (
    <BaseForm handleSubmit={handleSubmit} onSubmit={onSubmit} control={control} innerRef={formRef} ariaLabel="envoyer un message">
      <TextField
        {...register('message')}
        error={!!errors.message}
        placeholder="Message à envoyer"
        helperText={errors?.message?.message}
        multiline
        minRows={3}
        maxRows={10}
        fullWidth
        onKeyDown={(event) => {
          // Needed because multine TextField provides no way to submit on Enter (and to use Enter+Shift for a new line)
          if (event.key === 'Enter' && !event.shiftKey) {
            formRef.current?.requestSubmit();

            // Prevent the new line to appear after the `reset()`
            event.preventDefault();
          }
        }}
        InputProps={{
          endAdornment: (
            <InputAdornment
              position="end"
              sx={{
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <IconButton type="submit" aria-label="envoyer le message">
                {mutex.isLocked ? <CircularProgress size={20} aria-label="la réponse est en train d'être générée" /> : <SendIcon />}
              </IconButton>
              {!!props.canBeReset && (
                <IconButton onClick={props.onResetSession} color="error" disabled={mutex.isLocked} aria-label="redémarrer une session" sx={{ mt: 1 }}>
                  <RestartAltIcon />
                </IconButton>
              )}
            </InputAdornment>
          ),
        }}
      />
    </BaseForm>
  );
}
