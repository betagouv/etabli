import { program } from '@etabli/src/cli/program';

// This would break imports from Next.js so isolating it to be run only by CLI
program.parse();
