/**
 * @jest-environment node
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { analyzeWithSemgrep } from '@etabli/semgrep/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('analyzeWithSemgrep()', () => {
  it('should analyze correctly a node project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/node');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-node.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: ['dependency-a', 'dependency-b', 'dependency-c', 'dependency-d'],
      functions: ['sendWelcomeMessage', 'sendEmail', 'globalCallback', 'asyncGlobalCallback', 'run', 'notificationCallback'],
    });
  });

  it('should analyze correctly a php project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/php');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-php.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: ['dependency-a', 'dependency-b', 'dependency-c', 'dependency-d'],
      functions: ['sendWelcomeMessage', 'sendEmail', '$globalCallback', 'run', '$notificationCallback'],
    });
  });

  it('should analyze correctly a ruby project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/ruby');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-ruby.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: ['dependency-a', 'dependency-b', 'dependency-c', 'dependency-d'],
      functions: ['send_welcome_message', 'send_email', '$global_callback', 'run', 'notification_callback'],
    });
  });
});
