// The DSFR switches its own colors before the first paint, but MUI colors come from the theme computed while rendering. Without knowing
// the color scheme the server rendered them light, and dark mode users saw light buttons until the browser took over.
// Not in the client component file, otherwise the server would only get a reference to it instead of the value
export const colorSchemeCookieName = 'colorScheme';
