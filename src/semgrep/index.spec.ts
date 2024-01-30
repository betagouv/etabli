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

  it('should analyze correctly a python project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/python');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-python.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: [
        'python_version',
        'dependency-pipfile-a',
        'dependency-pipfile-b',
        'dependency-pipfile-c',
        'dependency-pipfile-d',
        'version',
        'python',
        'dependency-pyproject-a',
        'dependency-pyproject-b',
        'dependency-pyproject-c',
        'dependency-pyproject-d',
        'dependency-requirementstxt-a',
        'dependency-requirementstxt-b',
        'dependency-requirementstxt-c',
        'dependency-requirementstxt-d',
      ],
      functions: ['send_welcome_message', 'send_email', 'global_callback', 'async_global_callback', 'run', 'notification_callback'],
    });
  });
});

it('should analyze correctly a java project', async () => {
  const codeFolder = path.resolve(__dirname, 'samples/java');
  const resultsPath = path.resolve(__dirname, 'results/code-analysis-java.json');

  const results = await analyzeWithSemgrep(codeFolder, resultsPath);

  expect(results).toStrictEqual({
    dependencies: [
      'dependency-gradle-a',
      'com.thirdcompany.tool:dependency-gradle-b',
      'dependency-gradle-c',
      'com.thirdcompany.tool:dependency-gradle-d',
      'com.thirdcompany.tool:dependency-gradle-e',
      'dependency-maven-a',
      'dependency-maven-b',
    ],
    functions: ['globalCallback', 'run', 'notificationCallback', 'Mailer', 'sendWelcomeMessage', 'sendEmail'],
  });
});
