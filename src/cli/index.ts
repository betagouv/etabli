import { program } from '@etabli/src/cli/program';
import { gracefulExit } from '@etabli/src/server/system';

// This would break imports from Next.js so isolating it to be run only by CLI
program.parseAsync().catch((error) => {
  gracefulExit(error);
});
