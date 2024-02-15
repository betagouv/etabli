'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SendIcon from '@mui/icons-material/Send';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { v4 as uuidv4 } from 'uuid';

import { trpc } from '@etabli/src/client/trpcClient';
import { BaseForm } from '@etabli/src/components/BaseForm';
import { RequestAssistantPrefillSchemaType, RequestAssistantSchema, RequestAssistantSchemaType } from '@etabli/src/models/actions/assistant';
import { MessageAuthorSchema, MessageSchema, MessageSchemaType } from '@etabli/src/models/entities/assistant';

export interface RequestAssistantFormProps {
  prefill?: RequestAssistantPrefillSchemaType;
  onNewMessage?: (message: MessageSchemaType) => void;
  onResetSession?: () => void;
  canBeReset?: boolean;
}

export function RequestAssistantForm(props: RequestAssistantFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);

  const requestAssistant = trpc.requestAssistant.useMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    reset,
  } = useForm<RequestAssistantSchemaType>({
    resolver: zodResolver(RequestAssistantSchema),
    defaultValues: props.prefill,
  });

  const onSubmit = async (input: RequestAssistantSchemaType) => {
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
    // (it may force the user to copy/paste in case of error to retry, but for now it's acceptable)
    reset();

    // Note: we keep it simple, in case of error the parent component will still display what has been sent even if no answer and the possibility to resend (appending again the same message potentially)
    const result = await requestAssistant.mutateAsync(input);

    if (props.onNewMessage) {
      props.onNewMessage(result.answer);
    }
  };

  return (
    <BaseForm handleSubmit={handleSubmit} onSubmit={onSubmit} control={control} innerRef={formRef} ariaLabel="envoyer un message">
      <TextField
        label="Message à envoyer"
        {...register('message')}
        error={!!errors.message}
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
                {requestAssistant.isLoading ? <CircularProgress size={20} aria-label="la réponse est en train d'être générée" /> : <SendIcon />}
              </IconButton>
              {!!props.canBeReset && (
                <IconButton onClick={props.onResetSession} color="error" disabled={requestAssistant.isLoading} aria-label="redémarrer une session">
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
