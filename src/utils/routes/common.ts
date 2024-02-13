export type Lang = 'en'; // If more locales available, add them here

//
// We had to redefine some types since not exported by the `type-route` library
//

declare type KeysMatching<TObject, TCondition> = {
  [TKey in keyof TObject]: TObject[TKey] extends TCondition ? TKey : never;
}[keyof TObject];

declare type PathParamNames<TParamDefCollection> = KeysMatching<
  TParamDefCollection,
  {
    ['~internal']: {
      kind: 'path';
    };
  }
>;

declare type PathParams<TParamDefCollection> = {
  [TParamName in PathParamNames<TParamDefCollection>]: string;
};

export type PathFn<TParamDefCollection> = (x: PathParams<TParamDefCollection>) => string | string[];

export type Paths<Params> = { [key in Lang]: PathFn<Params> };

export function defineLocalizedRoute<Params>(params: Params, paths: Paths<Params>) {
  return {
    params: params,
    paths: paths,
  };
}
