import { createRouter, defineRoute, param } from 'type-route';

// `ts-import` paths as `compilerOptions` are not working, we modified the import below to use a relative one
// import { Lang, defineLocalizedRoute } from '@etabli/src/utils/routes/common';
import { Lang, defineLocalizedRoute } from './common';

export const localizedRoutes = {
  explore: defineLocalizedRoute(
    {},
    {
      en: (p) => `/explore`,
    }
  ),
  home: defineLocalizedRoute(
    {},
    {
      en: (p) => `/`,
    }
  ),
  initiative: defineLocalizedRoute(
    { initiativeId: param.path.string },
    {
      en: (p) => `/initiative/${p.initiativeId}`,
    }
  ),
};

// function createLocalizedRouter(lang: Lang, localeRoutes: typeof localizedRoutes) {
//   const dummy: any = {};

//   const pseudoRoutes = localeRoutes as any;
//   for (const routeName in localeRoutes) {
//     console.log(routeName);
//     console.log(pseudoRoutes[routeName]);

//     dummy[routeName] = defineRoute(pseudoRoutes[routeName].params, pseudoRoutes[routeName].paths[lang]);
//   }

//   return createRouter(dummy).routes;
// }

// export const routes = {
//   en: createLocalizedRouter('en', localizedRoutes),
//   fr: createLocalizedRouter('fr', localizedRoutes),
// };

//
//
// [TO READ]
// I'm really sorry... I was looking to get a registry of links to be type-safe but I was not able to
// implement `createLocalizedRouter` so it keeps types in the return. I have no idea how to deal with that... so doing building the object manually for now
//
//

function createLocalizedRouter<RouteDefs extends { [routeName in keyof typeof localizedRoutes]: any }>(routeDefs: RouteDefs) {
  return createRouter(routeDefs);
}

export const routes = {
  en: createLocalizedRouter({
    explore: defineRoute(localizedRoutes.explore.params, localizedRoutes.explore.paths.en),
    home: defineRoute(localizedRoutes.home.params, localizedRoutes.home.paths.en),
    initiative: defineRoute(localizedRoutes.initiative.params, localizedRoutes.initiative.paths.en),
  }).routes,
};
