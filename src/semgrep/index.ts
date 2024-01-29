import { $ } from 'execa';
import fsSync from 'fs';
import fs from 'fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'path';

import { SemgrepResultSchema } from '@etabli/semgrep';

export interface AnalysisResult {
  functions: string[];
  dependencies: string[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function analyzeWithSemgrep(folderPath: string, outputPath: string): Promise<AnalysisResult> {
  // TODO: others __dirname
  const codeAnalysisRulesPath = path.resolve(__dirname, '../../', 'semgrep-rules.yaml');

  if (!fsSync.existsSync(codeAnalysisRulesPath)) {
    throw new Error('semgrep rules must exist');
  }

  try {
    await $`semgrep --metrics=off --config ${codeAnalysisRulesPath} ${folderPath} --json -o ${outputPath}`;
  } catch (error) {
    console.log(`the details of the semgrep error can be read into ${outputPath}`);

    throw error;
  }

  const codeAnalysisDataString = await fs.readFile(outputPath, 'utf-8');
  const codeAnalysisDataObject = JSON.parse(codeAnalysisDataString);
  const codeAnalysisData = SemgrepResultSchema.parse(codeAnalysisDataObject);

  const functions: string[] = [];
  const dependencies: string[] = [];

  for (const result of codeAnalysisData.results) {
    switch (result.check_id) {
      case 'node-extract-functions':
        if (
          result.extra.metavars.$FUNC?.abstract_content &&
          !['constructor'].includes(result.extra.metavars.$FUNC?.abstract_content) // We did not succeed to add this rule to semgrep so filtering here
        ) {
          functions.push(result.extra.metavars.$FUNC?.abstract_content);
        }
        break;
      case 'node-find-dependencies':
        if (result.extra.metavars.$1?.abstract_content) {
          // We had to use a regex that cannot be named to escape additional quotes around the dependency name
          dependencies.push(result.extra.metavars.$1.abstract_content);
        } else if (result.extra.metavars.$DEPENDENCY_NAME?.abstract_content) {
          dependencies.push(result.extra.metavars.$DEPENDENCY_NAME.abstract_content);
        }
        break;
      default:
        throw new Error('rule handler not implemented');
    }
  }

  return {
    // Unique ones
    functions: [...new Set(functions)],
    dependencies: [...new Set(dependencies)],
  };
}
