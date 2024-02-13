import { DevTool } from '@hookform/devtools';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import * as Sentry from '@sentry/nextjs';
import { Mutex } from 'locks';
import { CSSProperties, FormEventHandler, MutableRefObject, PropsWithChildren, useRef, useState } from 'react';
import { Control, FieldErrorsImpl, FieldValues, UseFormHandleSubmit } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ErrorAlert } from '@etabli/src/components/ErrorAlert';
import { BusinessError } from '@etabli/src/models/entities/errors';
import { stopSubmitPropagation } from '@etabli/src/utils/form';
import { capitalizeFirstLetter } from '@etabli/src/utils/format';

export interface BaseFormProps<FormSchemaType extends FieldValues> {
  handleSubmit: UseFormHandleSubmit<FormSchemaType>;
  onSubmit: (input: FormSchemaType) => Promise<void>;
  control: Control<any>;
  ariaLabel: string;
  preventParentFormTrigger?: boolean;
  style?: CSSProperties;
  innerRef?: MutableRefObject<HTMLFormElement | null>;
}

// When you want to debug a form, just uncomment the below line (I did not see the value to manage it through environment variable)
export function BaseForm<FormSchemaType extends FieldValues>(props: PropsWithChildren<BaseFormProps<FormSchemaType>>) {
  const { t } = useTranslation('common');
  const [validationErrors, setValidationErrors] = useState<Partial<FieldErrorsImpl<any>>>(props.control._formState.errors);
  const [onSubmitError, setOnSubmitError] = useState<Error | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null); // This is used to scroll to the error messages
  const [mutex] = useState<Mutex>(new Mutex());

  const setMultipleRefs = (element: HTMLFormElement) => {
    formRef.current = element;

    if (props.innerRef) {
      props.innerRef.current = element;
    }
  };

  // Some forms in dialogs need to force stopping submit propagation leakage on parent forms
  const onSubmit: FormEventHandler<HTMLFormElement> = async (...args) => {
    // If it's already running, quit
    if (!mutex.tryLock()) {
      args[0].preventDefault();
      return;
    }

    try {
      const submitChain = props.handleSubmit(
        async (input: FormSchemaType) => {
          try {
            // Validation has passed, reset validation errors
            setValidationErrors({});

            await props.onSubmit(input);

            setOnSubmitError(null);
          } catch (err: unknown) {
            if (err instanceof Error) {
              setOnSubmitError(err);
            } else {
              setOnSubmitError(err as any); // The default case is good enough for now
            }

            // If not from the server it means in case of a none business error it has not been reported (and will not be due to this catch), so doing it
            if (!(err instanceof Error && err.name === 'TRPCClientError') && !(err instanceof BusinessError)) {
              Sentry.captureException(err);
            }

            formRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
        },
        (errors) => {
          // Reset previous error from business code
          setOnSubmitError(null);

          // Only triggered on inputs validation errors
          setValidationErrors(errors);

          formRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      );

      await (props.preventParentFormTrigger ? stopSubmitPropagation(submitChain) : submitChain).apply(null, args);
    } finally {
      // Unlock to allow a new submit
      mutex.unlock();
    }
  };

  return (
    <>
      {/* <DevTool control={props.control} /> */}

      <form onSubmit={onSubmit} aria-label={props.ariaLabel} style={props.style} ref={setMultipleRefs}>
        <Grid container spacing={2}>
          {!!onSubmitError && (
            <Grid item xs={12} sx={{ py: 2 }}>
              <ErrorAlert errors={[onSubmitError]} />
            </Grid>
          )}

          {Object.keys(validationErrors).length > 0 && (
            <Grid item xs={12} sx={{ py: 2 }}>
              <Alert severity="error">
                {validationErrors[''] !== undefined
                  ? capitalizeFirstLetter(validationErrors['']?.message as string) // Uppercase first letter since our errors are lowercase by default for flexibility
                  : t('components.BaseForm.form_contains_errors', { count: Object.keys(validationErrors).length })}
              </Alert>
            </Grid>
          )}

          {props.children}
        </Grid>
      </form>
    </>
  );
}
