// The PostgreSQL schema the tables live in, read from the `?schema=` parameter of `DATABASE_URL` as Prisma Migrate does,
// so the application and the migrations always target the same one. Deployments use a dedicated schema (`etabli`) instead
// of `public`: on a shared server every role has access to `public`. Without the parameter it stays `public`
export function getDatabaseSchema(databaseUrl: string | undefined): string {
  let schema = 'public';

  try {
    schema = (databaseUrl && new URL(databaseUrl).searchParams.get('schema')) || 'public';
  } catch (error) {
    // Not a URL, the connection itself will report it
  }

  // It ends in the connection options where quoting is not possible, a plain name is all we need
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`the database schema "${schema}" must only contain lowercase letters, digits and underscores`);
  }

  return schema;
}

// Queries written by hand (and by libraries like LangChain) do not name the schema, they rely on the search path. The extensions
// are also looked for there: created by the migrations they end in the schema, but they may already exist in `public` beforehand
export function getDatabaseSearchPath(schema: string): string {
  return schema === 'public' ? 'public' : `${schema},public`;
}
