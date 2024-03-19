import * as Sentry from '@sentry/nextjs';
import { noCase } from 'change-case';
import { $ } from 'execa';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';

import { SemgrepResultSchema } from '@etabli/src/semgrep';

const __root_dirname = process.cwd();

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
    await $`semgrep --metrics=off --no-git-ignore --config ${codeAnalysisRulesPath} ${folderPath} --json -o ${outputPath}`;

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
    let acceptableError: boolean = false;
    if (fsSync.existsSync(outputPath)) {
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
        // We silent the error since in any way we could extract valuable information, we consider this as acceptable
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
