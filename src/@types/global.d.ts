//
// [IMPORTANT] Importing from the top of the file and not from inside a `declare module xxx`
// will make the module extended. So here it's to replace full definition of a module, aside files with imports
// are to enhance some modules while keeping other inner types accessible
//

declare module '*.txt' {
  const content: string;
  export default content;
}

declare module '*.html' {
  const content: string;
  export default content;
}

interface ServerRuntimeConfig {
  //
}

interface PublicRuntimeConfig {
  appMode: 'prod' | 'dev' | 'test';
  appVersion: string;
}

interface RuntimeConfig {
  serverRuntimeConfig: ServerRuntimeConfig;
  publicRuntimeConfig: PublicRuntimeConfig;
}

declare module 'next/config' {
  const value: () => RuntimeConfig;
  export default value;
}
declare module 'storybook-mock-date-decorator';
