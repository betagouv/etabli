import * as Sentry from '@sentry/nextjs';
import { noCase } from 'change-case';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import { $ } from 'execa';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { SemgrepResultSchema } from '@etabli/src/semgrep';

const __root_dirname = process.cwd();
const semgrepMemoryLimitPerFile = process.env.SEMGREP_PER_FILE_MEMORY_LIMIT_IN_MB ? parseInt(process.env.SEMGREP_PER_FILE_MEMORY_LIMIT_IN_MB, 10) : 0; // Default (0) is unlimited

export interface AnalysisResult {
  functions: string[];
  dependencies: string[];
}

export function isFunctionNameMeaningful(functionName: string): boolean {
  // We expect the function name to have more than a word otherwise it cannot bring information for analyzing business use cases
  // Bonus: it may also prevent having minified files functions (depends on the complexitty of the minification)
  const functionNameWordsCount = noCase(functionName).split(' ').length;

  return functionNameWordsCount > 1;
}

export async function analyzeWithSemgrep(folderPath: string, outputPath: string): Promise<AnalysisResult> {
  const codeAnalysisRulesPath = path.resolve(__root_dirname, './semgrep-rules.yaml');
  const bibliothecaryScriptPath = path.resolve(__root_dirname, './src/bibliothecary/deps-parser.rb');

  if (!fsSync.existsSync(codeAnalysisRulesPath)) {
    throw new Error('semgrep rules must exist');
  }

  // Since errors may or not be written into the result file, we make sure to remove any previous results to not mix with previous attempt
  if (fsSync.existsSync(outputPath)) {
    await fs.rm(outputPath);
  }

  const functions: string[] = [];

  try {
    // `--no-git-ignore` is required since the `.semgrepignore` is not taken into account with absolute paths (ref: https://github.com/semgrep/semgrep/issues/9960)
    // `--max-memory` is scoped to the analysis for each file, skipping it if reaching the limit, size it according to the server capacity, but keep in mind since doing concurrency we could still reach the limit (if so, put a semaphore around this instruction)
    await $({
      // When it takes too much time it's not temporary, it's always the same for this specific repository, so better to skip it
      // For example with https://forge.aeif.fr/edupyter/EDUPYTER310 there is no big file, but around ~3000 files to analyze
      // and it was like stuck forever, until resulting in a OOM, or a JSON file being so big that the `readFile` was throwing `RangeError: Invalid string length` which is the limit a string can contains
      // Ref: https://github.com/semgrep/semgrep/issues/9469#issuecomment-2007687541
      timeout: minutesToMilliseconds(2),
    })`semgrep --metrics=off --no-git-ignore --max-memory ${semgrepMemoryLimitPerFile} --config ${codeAnalysisRulesPath} ${folderPath} --json -o ${outputPath}`;

    const codeAnalysisDataString = await fs.readFile(outputPath, 'utf-8');
    const codeAnalysisDataObject = JSON.parse(codeAnalysisDataString);
    const codeAnalysisData = SemgrepResultSchema.parse(codeAnalysisDataObject);

    for (const result of codeAnalysisData.results) {
      if (result.check_id.endsWith('-extract-functions')) {
        if (result.extra.metavars.$FUNC?.abstract_content && isFunctionNameMeaningful(result.extra.metavars.$FUNC.abstract_content)) {
          functions.push(result.extra.metavars.$FUNC.abstract_content);
        }
      } else {
        throw new Error('rule handler not implemented');
      }
    }
  } catch (error) {
    // We allow silenting the error if this one is related to the repository itself, so we can still analyze valuable information with biliothecary
    let acceptableError: boolean = false;

    // Make sure it's a formatted execa error (ref: https://github.com/sindresorhus/execa/issues/909)
    // Note: for a timeout `error.timedOut` can be true, but sometimes it says it has been killed (`error.killed`)... so just checking the `error.failed` flag
    if (error instanceof Error && !!(error as any).failed && !!(error as any).shortMessage) {
      console.log(`semgrep analysis skipped since it has reached the defined timeout limit`);

      acceptableError = true;
    } else if (fsSync.existsSync(outputPath)) {
      console.log(`the details of the semgrep error can be read into ${outputPath}, but pushing it on Sentry too`);

      const codeAnalysisDataString = await fs.readFile(outputPath, 'utf-8');
      const codeAnalysisDataObject = JSON.parse(codeAnalysisDataString);
      const codeAnalysisData = SemgrepResultSchema.parse(codeAnalysisDataObject);

      if (
        // We don't use `.some()` in case there is also other errors we never took into account
        codeAnalysisData.errors.every((semgrepError) => {
          return semgrepError.message.includes('Invalid_argument: index out of bounds');
        })
      ) {
        // This means the project is way too stuffed to be analyzed by semgrep
        console.log(`semgrep analysis skipped due to the project being too big`);

        acceptableError = true;
      } else {
        Sentry.captureException(error, {
          extra: {
            errors: codeAnalysisData.errors,
          },
        });
      }
    }

    if (!acceptableError) {
      throw error;
    }
  }

  // We no longer find dependencies through semgrep since the tool was too limited, we switched to `bibliothecary` but we leave the logic here
  const rawDependencies = await $`ruby ${bibliothecaryScriptPath} ${folderPath}`;
  const dependencies: string[] = rawDependencies.stdout.split('\n').filter((dependency) => dependency !== '');

  return {
    // Unique ones
    functions: [...new Set(functions)],
    dependencies: [...new Set(dependencies)],
  };
}
