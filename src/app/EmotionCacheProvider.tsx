'use client';

import createCache, { Options } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { useServerInsertedHTML } from 'next/navigation';
import { PropsWithChildren, useState } from 'react';

// Without it the server writes MUI styles next to each element in the body, so after the DSFR stylesheet, whereas the browser
// puts them before it (`prepend`). The DSFR then won only once the JavaScript was loaded (links getting their underline afterwards...).
// Styles are now gathered while rendering and given in the head like the browser does (ref: https://mui.com/material-ui/guides/next-js-app-router/)
const prependEmotionStylesScript = `(function () {
  var head = document.head;
  var firstStylesheet = head.querySelector('link[rel="stylesheet"], style:not([data-emotion])');
  if (!firstStylesheet) return;
  document.querySelectorAll('style[data-emotion]').forEach(function (style) {
    if (style.compareDocumentPosition(firstStylesheet) & Node.DOCUMENT_POSITION_PRECEDING) head.insertBefore(style, firstStylesheet);
  });
})();`;

export function EmotionCacheProvider(props: PropsWithChildren<{ options: Options }>) {
  const [registry] = useState(() => {
    const cache = createCache(props.options);
    cache.compat = true;

    const previousInsert = cache.insert;
    let inserted: { name: string; isGlobal: boolean }[] = [];

    cache.insert = (...args) => {
      const [selector, serialized] = args;

      if (cache.inserted[serialized.name] === undefined) {
        inserted.push({ name: serialized.name, isGlobal: !selector });
      }

      return previousInsert(...args);
    };

    const flush = () => {
      const previouslyInserted = inserted;
      inserted = [];

      return previouslyInserted;
    };

    return { cache, flush };
  });

  // `data-s` keeps the default cache of `@emotion/react` from taking them and moving them to the end of the head (the links lost their underline
  // for an instant), only this cache hydrates them
  useServerInsertedHTML(() => {
    const inserted = registry.flush();

    if (inserted.length === 0) {
      return null;
    }

    let styles = '';
    let dataEmotionAttribute = registry.cache.key;
    const globals: { name: string; style: string }[] = [];

    for (const { name, isGlobal } of inserted) {
      const style = registry.cache.inserted[name];

      if (typeof style === 'string') {
        if (isGlobal) {
          globals.push({ name, style });
        } else {
          styles += style;
          dataEmotionAttribute += ` ${name}`;
        }
      }
    }

    return (
      <>
        {globals.map(({ name, style }) => (
          <style
            key={name}
            nonce={props.options.nonce}
            data-s=""
            data-emotion={`${registry.cache.key}-global ${name}`}
            dangerouslySetInnerHTML={{ __html: style }}
          />
        ))}
        {styles !== '' && (
          <style nonce={props.options.nonce} data-s="" data-emotion={dataEmotionAttribute} dangerouslySetInnerHTML={{ __html: styles }} />
        )}
        {props.options.prepend && (
          // Next.js gives them at the end of the head, so after the DSFR stylesheet. Run while the page is read, before anything is displayed
          <script nonce={props.options.nonce} dangerouslySetInnerHTML={{ __html: prependEmotionStylesScript }} />
        )}
      </>
    );
  });

  return <CacheProvider value={registry.cache}>{props.children}</CacheProvider>;
}
