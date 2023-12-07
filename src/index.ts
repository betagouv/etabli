import fsSync from 'fs';
import fs from 'fs/promises';
import handlebars from 'handlebars';
import OpenAI from 'openai';
import path from 'path';
import { Browser, Page, chromium } from 'playwright';
import { encoding_for_model } from 'tiktoken';
import Wappalyzer from 'wappalyzer';

import { SemgrepResultSchema } from '@etabli/semgrep';
import { ResultSchema, resultSample } from '@etabli/template';
import { WappalyzerResultSchema } from '@etabli/wappalyzer';

const gptModel = 'gpt-3.5-turbo-1106';
const gptCountModel = 'gpt-3.5-turbo'; // The counter does not understand precise GPT versions
const gptModelTokenLimit = 16385; // Precise token maximum can be found on https://www.scriptbyai.com/token-limit-openai-chatgpt/
const gptPer1000TokensCost = 0.001; // https://openai.com/pricing
const gptSeed = 100;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const wappalyzer = new Wappalyzer({
  debug: false,
  delay: 1000,
  headers: {},
  maxDepth: 1,
  maxUrls: 10,
  maxWait: 10000,
  recursive: true,
  probe: true,
  userAgent: 'Wappalyzer',
  htmlMaxCols: 2000,
  htmlMaxRows: 2000,
  noRedirect: true,
});

export interface Initiative {
  name: string;
  repositoryUrl: string;
  websiteUrl: string;
}

// Initiatives listed are for now all monorepository using typescript
// (will evolve if the proof of concept is a success)
export const initiatives: Initiative[] = [
  {
    name: 'Médiature',
    repositoryUrl: 'https://github.com/inclusion-numerique/mediature',
    websiteUrl: 'https://www.mediateur-public.fr/',
  },
  {
    name: 'Aides Jeunes',
    repositoryUrl: 'https://github.com/betagouv/aides-jeunes',
    websiteUrl: 'https://www.1jeune1solution.gouv.fr/mes-aides',
  },
  {
    name: 'Mon compte pro',
    repositoryUrl: 'https://github.com/betagouv/moncomptepro',
    websiteUrl: 'https://moncomptepro.beta.gouv.fr/',
  },
  {
    name: 'Territoires en transitions',
    repositoryUrl: 'https://github.com/betagouv/territoires-en-transitions',
    websiteUrl: 'https://www.territoiresentransitions.fr/',
  },
  {
    name: 'France chaleur urbaine',
    repositoryUrl: 'https://github.com/betagouv/france-chaleur-urbaine',
    websiteUrl: 'https://france-chaleur-urbaine.beta.gouv.fr/',
  },
  {
    name: 'Preuve covoiturage',
    repositoryUrl: 'https://github.com/betagouv/preuve-covoiturage',
    websiteUrl: 'https://app.covoiturage.beta.gouv.fr/',
  },
];

export async function getHTML(url: string): Promise<string> {
  console.log('getting website HTML content');

  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();

  await page.goto(url);
  await page.waitForTimeout(2000); // Wait for JS to init page (in case it's needed)

  const html: string = await page.content();

  await browser.close();

  return html;
}

export async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const content = await response.arrayBuffer();
  await fs.writeFile(destination, new Uint8Array(content));
}

export async function main() {
  // Cannot be imported directly due because it needs `"type": "module"` but Playwright cannot work with it
  const { $ } = await import('execa');

  const initiativeToProcess = initiatives[0];

  console.log('starting gathering information');

  // Define unique ID for this project
  // TODO: should a merged of production website URL and main repository (don't know how to calculate it right now) + be compatible with filename format
  const projectId = initiativeToProcess.name;

  // Get content
  const projectDirectory = path.resolve(__dirname, '../data/', projectId);
  const htmlPath = path.resolve(projectDirectory, 'website.html');

  if (!fsSync.existsSync(htmlPath)) {
    await fs.mkdir(projectDirectory, { recursive: true });

    const tmpHtmlContent = await getHTML(initiativeToProcess.websiteUrl);
    await fs.writeFile(htmlPath, tmpHtmlContent, {});
  }

  // Reduce content by using `pandoc` to save tokens on GPT
  const markdownPath = path.resolve(projectDirectory, 'website.md');

  if (!fsSync.existsSync(markdownPath)) {
    const noImgAndSvgFilterPath = path.resolve(__dirname, '../src/pandoc/no-img-and-svg.lua');
    const extractMetaDescriptionFilterPath = path.resolve(__dirname, '../src/pandoc/extract-meta-description.lua');

    await $`pandoc ${htmlPath} --lua-filter ${noImgAndSvgFilterPath} --lua-filter ${extractMetaDescriptionFilterPath} -t gfm-raw_html -o ${markdownPath}`;
  }

  const websiteContent = await fs.readFile(markdownPath, 'utf-8');

  // Try to deduce tools used from the frontend
  const wappalyzerAnalysisPath = path.resolve(projectDirectory, 'wappalyzer-analysis.json');

  if (!fsSync.existsSync(wappalyzerAnalysisPath)) {
    try {
      await wappalyzer.init();

      const headers = {};
      const storage = {
        local: {},
        session: {},
      };
      const site = await wappalyzer.open(initiativeToProcess.websiteUrl, headers, storage);

      const results = await site.analyze();

      await fs.writeFile(wappalyzerAnalysisPath, JSON.stringify(results, null, 2));
    } finally {
      await wappalyzer.destroy();
    }
  }

  const wappalyzerAnalysisDataString = await fs.readFile(wappalyzerAnalysisPath, 'utf-8');
  const wappalyzerAnalysisDataObject = JSON.parse(wappalyzerAnalysisDataString);
  const wappalyzerAnalysisData = WappalyzerResultSchema.parse(wappalyzerAnalysisDataObject);

  const deducedTools: string[] = wappalyzerAnalysisData.technologies
    .filter((technology) => {
      // Set a minimum so uncertain tools like backend ones for compilation are ignored
      return technology.confidence >= 75;
    })
    .map((technology) => technology.name);

  // Get the source code
  const codeFolderPath = path.resolve(projectDirectory, 'code');

  if (!fsSync.existsSync(codeFolderPath)) {
    await $`git clone ${initiativeToProcess.repositoryUrl} ${codeFolderPath}`;
  }

  // Extract information from the source code
  const codeAnalysisPath = path.resolve(projectDirectory, 'code-analysis.json');
  const codeAnalysisRulesPath = path.resolve(__dirname, '../', 'semgrep-rules.yaml');

  if (!fsSync.existsSync(codeAnalysisPath)) {
    await $`semgrep --metrics=off --config ${codeAnalysisRulesPath} ${codeFolderPath} --json -o ${codeAnalysisPath}`;
  }

  const codeAnalysisDataString = await fs.readFile(codeAnalysisPath, 'utf-8');
  const codeAnalysisDataObject = JSON.parse(codeAnalysisDataString);
  const codeAnalysisData = SemgrepResultSchema.parse(codeAnalysisDataObject);

  let functions: string[] = [];
  let dependencies: string[] = [];

  for (const result of codeAnalysisData.results) {
    switch (result.check_id) {
      case 'node-extract-functions':
        if (result.extra.metavars.$FUNC?.abstract_content) {
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

  // Unique ones
  functions = [...new Set(functions)];
  dependencies = [...new Set(dependencies)];

  // Prepare the content for GPT
  const gptTemplatePath = path.resolve(__dirname, '../src', 'gpt-template.md');
  const gptTemplateContent = await fs.readFile(gptTemplatePath, 'utf-8');
  const gptTemplate = handlebars.compile(gptTemplateContent);

  const finalGptContent = gptTemplate({
    resultSample: JSON.stringify(resultSample, null, 2), // Format otherwise it's `[object Object]`
    functions: functions,
    deducedTools: deducedTools,
    dependencies: dependencies,
    websiteContent: websiteContent,
  });

  const gptPromptPath = path.resolve(projectDirectory, 'gpt-prompt.md');
  await fs.writeFile(gptPromptPath, finalGptContent);

  // Make sure the content is valid
  const encoder = encoding_for_model(gptCountModel);
  const tokens = encoder.encode(finalGptContent);
  encoder.free();

  if (tokens.length >= gptModelTokenLimit) {
    throw new Error('there are too many tokens for this model to accept it');
  }

  console.log(`the content to send is ${tokens.length} tokens long (${gptModelTokenLimit} is the input+output limit)`);

  // Process data
  const answer = await openai.chat.completions.create({
    model: gptModel,
    messages: [
      {
        role: 'user',
        content: finalGptContent,
      },
    ],
    response_format: {
      type: 'json_object',
    },
    temperature: 0, // Less creative answer, more deterministic
    top_p: 0.1,
    seed: gptSeed, // Cannot guarantee exact same answers for the same prompt, but should help (`system_fingerprint` can also be watched to detect a system change on their side)
  });

  if (answer.usage) {
    console.log(
      `the GPT input and output represent ${answer.usage.total_tokens} tokens in total (for a cost of ~$${
        (answer.usage.total_tokens / 1000) * gptPer1000TokensCost
      })`
    );

    if (answer.usage.total_tokens > gptModelTokenLimit) {
      console.warn('it seemed to process more token than the limit, the content may be truncated and invalid');
    }
  }

  if (answer.choices.length !== 1) {
    throw new Error('GPT result should send only 1 answer');
  } else if (answer.choices[0].finish_reason !== 'stop') {
    throw new Error('GPT result should have a normal finish reason');
  } else if (!answer.choices[0].message.content) {
    throw new Error('GPT result content cannot be null');
  }

  const answerObject = JSON.parse(answer.choices[0].message.content);
  const answerData = ResultSchema.parse(answerObject);
  const beautifiedAnswerData = JSON.stringify(answerData, null, 2);

  const gptAnswerPath = path.resolve(projectDirectory, 'gpt-answer.json');

  await fs.writeFile(gptAnswerPath, beautifiedAnswerData);

  console.log('\n');
  console.log('\n');
  console.log(beautifiedAnswerData);
  console.log('\n');
  console.log('\n');
  console.log(`the JSON result has been written to: ${gptAnswerPath}`);
}

main().catch((err) => {
  if (err instanceof OpenAI.APIError) {
    console.log(err.status);
    console.log(err.name);

    throw err;
  } else {
    throw err;
  }
});
