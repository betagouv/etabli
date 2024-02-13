// Since no library we declare the array of corresponding sizes
// Source: https://gist.github.com/gburd/3086007
// Note: since using `bytea` type of Postgres, it cannot be over 1 GiB
export const bitsFor = {
  KiB: 1024,
  MiB: 1048576,
  GiB: 1073741824,
  // "TiB": 1099511627776,
  // "EiB": 1152921504606846976,
  // "ZiB": 1180591620717411303424,
  // "YiB": 1208925819614629174706176,
};
