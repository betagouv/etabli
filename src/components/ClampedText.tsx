'use client';

import Box from '@mui/material/Box';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';

export interface ClampedTextProps {
  lines: number;
  likelyClamped?: boolean; // Guess for the server render (it cannot measure), the browser corrects it if wrong
}

// Cut by CSS so the server already renders the short version, the browser only adds the button when the text is longer
// (`react-show-more-text` measured and cut the text with JavaScript, so the whole text was displayed until then)
export function ClampedText(props: PropsWithChildren<ClampedTextProps>) {
  const textRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(!!props.likelyClamped);

  useEffect(() => {
    const element = textRef.current;

    if (!element) {
      return;
    }

    const checkClamping = () => setIsClamped(element.scrollHeight > element.clientHeight + 1);
    const resizeObserver = new ResizeObserver(checkClamping);

    checkClamping();
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <>
      <Box
        ref={textRef}
        sx={
          expanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitLineClamp: props.lines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
        }
      >
        {props.children}
      </Box>
      {(isClamped || expanded) && (
        <button
          type="button"
          className="show-more-less-clickable"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {expanded ? 'Voir moins' : 'Voir plus'}
        </button>
      )}
    </>
  );
}
