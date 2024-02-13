import { TypographyProps } from '@mui/material/Typography';
import { RegisterOptions } from 'react-hook-form';

export function forceHtmlRadioOutputToBeBoolean(value: string | null): boolean | null {
  if (value === 'true') {
    return true;
  } else if (value === 'false') {
    return false;
  } else if (value === null) {
    // Sometimes the radio group can be optional, allow this case
    return null;
  } else {
    throw new Error(`this radio group is supposed to only manage string boolean values ("true", "false"), or can optionally be null.`);
  }
}

export const reactHookFormBooleanRadioGroupRegisterOptions = {
  setValueAs: forceHtmlRadioOutputToBeBoolean,
} as RegisterOptions;

export const formTitleProps: TypographyProps<'h1'> = {
  variant: 'h4',
  sx: {
    mb: 2,
  },
};

/**
 * @deprecated should be removed even if it spreads action/dialog across code, better to not nest forms
 *
 * When a form is inside another form its submission will submit also the parent one.
 * The only solution is to stop the event propagation... it should remains rare (only when using dialogs for example)
 */
export function stopSubmitPropagation(callback: React.FormEventHandler<HTMLFormElement>) {
  return async (event: React.FormEvent<HTMLFormElement>) => {
    if (event && event.stopPropagation) {
      event.stopPropagation();
    }

    await callback(event);
  };
}
