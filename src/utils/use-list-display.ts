'use client';

import { useCallback, useState } from 'react';

import { ListDisplay, listDisplayCookieName } from '@etabli/src/utils/display';
import { setPreferenceCookie } from '@etabli/src/utils/preference-cookie';

export function useListDisplay(initialValue: ListDisplay): [ListDisplay, (value: ListDisplay) => void] {
  const [listDisplay, setListDisplayState] = useState<ListDisplay>(initialValue);

  const setListDisplay = useCallback((value: ListDisplay) => {
    setListDisplayState(value);

    setPreferenceCookie(listDisplayCookieName, value);
  }, []);

  return [listDisplay, setListDisplay];
}
