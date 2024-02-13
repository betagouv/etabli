import { DocsContainer as BaseContainer } from '@storybook/addon-docs';
import { themes } from '@storybook/theming';
import React, { useEffect, useState } from 'react';

function isDarkInStorage(): boolean {
  const themeString = localStorage.getItem('sb-addon-themes-3');

  if (themeString) {
    const theme = JSON.parse(themeString);

    return theme['current'] !== 'light';
  }

  return false;
}

export const ThemedDocsContainer = ({ children, context }) => {
  // The following is a workaround, I explained with in https://github.com/hipstersmoothie/storybook-dark-mode/issues/127#issuecomment-1369228348

  const [isDark, setIsDark] = useState(isDarkInStorage());

  const handler = () => {
    setIsDark(isDarkInStorage());
  };

  useEffect(() => {
    window.addEventListener('storage', handler);

    return function cleanup() {
      window.removeEventListener('storage', handler);
    };
  });

  return (
    <BaseContainer context={context} theme={isDark ? themes.dark : themes.light}>
      {children}
    </BaseContainer>
  );
};
