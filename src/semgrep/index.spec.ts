/**
 * @jest-environment node
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { analyzeWithSemgrep } from '@etabli/src/semgrep/index';

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
        'dependency-pipfile-a',
        'dependency-pipfile-b',
        'dependency-pipfile-c',
        'dependency-pipfile-d',
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

  it('should analyze correctly a java project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/java');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-java.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: [
        // 'dependency-gradle-a', // `bibliothecary` does not read `classpath` instruction
        'com.thirdcompany.tool:dependency-gradle-b',
        'dependency-gradle-c:0.0.0',
        'com.thirdcompany.tool:dependency-gradle-d',
        'org.apache.maven:dependency-maven-a',
        'org.apache.maven:dependency-maven-b',
      ],
      functions: ['globalCallback', 'run', 'notificationCallback', 'Mailer', 'sendWelcomeMessage', 'sendEmail'],
    });
  });

  it('should analyze correctly a golang project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/golang');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-golang.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: ['bitbucket.org/account-a/dependency-a', 'bitbucket.org/account-a/dependency-b', 'github.com/account-b/dependency-c'],
      functions: ['sendWelcomeMessage', 'sendEmail', 'globalCallback', 'run'],
    });
  });

  it('should analyze correctly a rust project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/rust');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-rust.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: ['dependency-a', 'dependency-b', 'dependency-c', 'dependency-d'],
      functions: ['send_welcome_message', 'send_email', 'global_callback', 'async_global_callback', 'run', 'notification_callback'],
    });
  });

  it('should analyze correctly a cpp project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/cpp');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-cpp.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: [
        // TODO: `bibliothecary` does not support any c++ package mangers (neither Conan, nor Hunter, nor Vcpkg)
        // 'dependency-a',
        // 'dependency-b',
      ],
      functions: [
        'Mailer', // This class constructor cannot be skipped for now
        'sendWelcomeMessage',
        'sendEmail',
        'globalCallback',
        'asyncGlobalCallback',
        'run',
        // 'notificationCallback' // Cannot parse it for now, it's a bit too complicated
      ],
    });
  });

  it('should analyze correctly a scala project', async () => {
    const codeFolder = path.resolve(__dirname, 'samples/scala');
    const resultsPath = path.resolve(__dirname, 'results/code-analysis-scala.json');

    const results = await analyzeWithSemgrep(codeFolder, resultsPath);

    expect(results).toStrictEqual({
      dependencies: [
        // // Scala default package manager is `sbt` but its dependency file `build.sbt` has no structured format
        // // so it's impossible to parse it... just giving up. Note that Scala projects may use Java package managers since Scale is based on Java.
        // 'dependency-a',
        // 'dependency-b',
        // 'dependency-c',
        // 'dependency-d',
      ],
      functions: ['sendWelcomeMessage', 'sendEmail', 'globalCallback', 'asyncGlobalCallback', 'run', 'notificationCallback'],
    });
  });
});
