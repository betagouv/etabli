import MuiAvatar from '@mui/material/Avatar';
import { useMemo } from 'react';

function extractInitials(fullName: string): string {
  const parts = fullName.split(/[ -]/);
  let initials = '';

  for (const part of parts) {
    initials += part.charAt(0);
  }

  if (initials.length > 3 && initials.search(/[A-Z]/) !== -1) {
    initials = initials.replace(/[a-z]+/g, '');
  }

  initials = initials.substr(0, 2).toUpperCase();

  return initials;
}

function stringToColor(string: string) {
  let hash = 0;
  let i;

  for (i = 0; i < string.length; i += 1) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
  }

  let color = '#';

  for (i = 0; i < 3; i += 1) {
    const value = (hash >> (i * 8)) & 0xff;
    color += `00${value.toString(16)}`.slice(-2);
  }

  return color;
}

export interface AvatarProps {
  fullName: string;
  src?: string | undefined;
  size?: number;
  sx?: React.ComponentProps<typeof MuiAvatar>['sx'];
}

export const Avatar = (props: AvatarProps) => {
  const size = useMemo(() => {
    return props.size || 24;
  }, [props.size]);

  return (
    <MuiAvatar
      className="UserAvatar"
      sx={{ width: size, height: size, fontSize: size / 2, bgcolor: stringToColor(props.fullName), ...(props.sx || {}) }}
      src={props.src}
      alt={props.src ? '' : undefined}
    >
      {props.src ? null : extractInitials(props.fullName)}
    </MuiAvatar>
  );
};
