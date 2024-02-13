import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useLocalStorage } from 'usehooks-ts';

export enum ListDisplay {
  GRID = 'grid',
  TABLE = 'table',
}

export function useLocalStorageListDisplay() {
  const muiTheme = useTheme();
  const breakpointUp = useMediaQuery(muiTheme.breakpoints.up('md'));

  return useLocalStorage<ListDisplay>('listDisplay', !breakpointUp ? ListDisplay.TABLE : ListDisplay.GRID);
}
