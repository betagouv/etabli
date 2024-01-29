/**
 * @jest-environment node
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { analyzeWithSemgrep } from '@etabli/semgrep/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('analyzeWithSemgrep()', () => {
  it('should analyze correctly node project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/node');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-node.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: ['dependency-a', 'dependency-b', 'dependency-c', 'dependency-d'],
      functions: ['sendWelcomeMessage', 'sendEmail', 'run'],
    });
  });
});
