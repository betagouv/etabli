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
  NetworkStreamChunkSchema,
  SessionAnswerChunkSchema,
  SessionAnswerChunkSchemaType,
} from '@etabli/src/models/entities/assistant';
import { CustomError, internalServerErrorError } from '@etabli/src/models/entities/errors';
import { mockBaseUrl, shouldTargetMock } from '@etabli/src/server/mock/environment';
import { CHUNK_DATA_PREFIX, CHUNK_ERROR_PREFIX } from '@etabli/src/utils/api';
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

        // A chunk may include multiple lines from multiple `res.write()`, so having to take this into acocunt
        let buffer = textDecoder.decode(value, { stream: true });
        let firstNewLine: number;

        while ((firstNewLine = buffer.indexOf('\n')) !== -1) {
          // Maybe it was not the "\n" of the ending chunk line, maybe it was
          const chunkLine = buffer.substring(0, firstNewLine);
          buffer = buffer.substring(firstNewLine + 1);

          // As explained into `src/utils/api.ts` we have to manage our own protocol to handle errors properly
          if (chunkLine.startsWith(CHUNK_DATA_PREFIX)) {
            const rawChunk = chunkLine.substring(CHUNK_DATA_PREFIX.length).trim();
            const jsonChunk = NetworkStreamChunkSchema.parse(JSON.parse(rawChunk));

            props.onNewMessageChunk &&
              props.onNewMessageChunk(
                SessionAnswerChunkSchema.parse({
                  sessionId: input.sessionId,
                  messageId: answerMessageId,
                  chunk: jsonChunk.content,
                })
              );
          } else if (chunkLine.startsWith(CHUNK_ERROR_PREFIX)) {
            const rawError = chunkLine.substring(CHUNK_ERROR_PREFIX.length).trim();
            const jsonError = JSON.parse(rawError);

            throw !!jsonError.code && !!jsonError.message ? new CustomError(jsonError.code, jsonError.message) : internalServerErrorError;
          } else {
            throw new Error(`the chunk line "${chunkLine}" is not handled`);
          }
        }
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
