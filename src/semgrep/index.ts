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

  try {
    await $`semgrep --metrics=off --config ${codeAnalysisRulesPath} ${folderPath} --json -o ${outputPath}`;
  } catch (error) {
    console.log(`the details of the semgrep error can be read into ${outputPath}, but pushing it on Sentry too`);

    const codeAnalysisDataString = await fs.readFile(outputPath, 'utf-8');
    const codeAnalysisDataObject = JSON.parse(codeAnalysisDataString);

    // For easy analysis since from logs it's hard to see the whole object in case of concurrency calls
    if (!!codeAnalysisDataObject.errors) {
      Sentry.captureException(error, {
        extra: {
          errors: codeAnalysisDataObject.errors,
        },
      });
    }

    throw error;
  }

  const codeAnalysisDataString = await fs.readFile(outputPath, 'utf-8');
  const codeAnalysisDataObject = JSON.parse(codeAnalysisDataString);
  const codeAnalysisData = SemgrepResultSchema.parse(codeAnalysisDataObject);

  const functions: string[] = [];

  for (const result of codeAnalysisData.results) {
    if (result.check_id.endsWith('-extract-functions')) {
      if (result.extra.metavars.$FUNC?.abstract_content && isFunctionNameMeaningful(result.extra.metavars.$FUNC.abstract_content)) {
        functions.push(result.extra.metavars.$FUNC.abstract_content);
      }
    } else {
      throw new Error('rule handler not implemented');
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
