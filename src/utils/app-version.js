const { Octokit } = require('@octokit/rest');
const gitRevision = require('git-rev-sync');
const parseGithubUrl = require('parse-github-url');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN || undefined, // If not specified it uses public shared quota based on IP
});

function getRepositoryInformation() {
  return parseGithubUrl(process.env.npm_package_repository_url);
}

function getFallbackCommitSha() {
  // Heroku/Scalingo remove the `.git` folder so during the build time we are unable to use `git-rev-sync`
  // we work around this by doing GET requests since they at least provide `$SOURCE_VERSION` that equals the commit SHA
  // during the build phase, and `$CONTAINER_VERSION` during the runtime phase (that should be most of the time the commit SHA).
  let commitSha = process.env.SOURCE_VERSION || process.env.CONTAINER_VERSION;
  if (commitSha === undefined) {
    throw new Error('`$SOURCE_VERSION` or `$CONTAINER_VERSION` environment variable must be provided to use the fallback');
  }

  return commitSha;
}

function getCommitSha() {
  let commitSha;
  try {
    commitSha = gitRevision.long();
  } catch (err) {
    commitSha = getFallbackCommitSha();
  }

  return commitSha;
}

async function getFallbackCommitInformation() {
  const commitSha = getFallbackCommitSha();
  const repoInfo = getRepositoryInformation();

  const result = await octokit.rest.repos.getCommit({
    owner: repoInfo.owner,
    repo: repoInfo.name,
    ref: commitSha,
  });

  return result.data;
}

async function getFallbackCommitTag() {
  const commitSha = getFallbackCommitSha();
  const repoInfo = getRepositoryInformation();

  const result = await octokit.rest.repos.listTags({
    owner: repoInfo.owner,
    repo: repoInfo.name,
    per_page: 100, // Maximum to not miss the right tag... for now we don't browse pages if more than one
  });

  for (const tagInfo of result.data) {
    if (tagInfo.commit.sha === commitSha) {
      return tagInfo.name;
    }
  }

  // As fallback otherwise
  // Note: it's possible
  return commitSha;
}

async function getCommitTag() {
  let tag;
  try {
    tag = gitRevision.tag();
  } catch (err) {
    tag = await getFallbackCommitTag();
  }

  return tag;
}

async function getGitRevisionDate() {
  let date;
  try {
    date = gitRevision.date();
  } catch (err) {
    const commitInfo = await getFallbackCommitInformation();
    date = new Date(commitInfo.commit.author.date);
  }

  return date.toISOString().split('.')[0].replace(/\D/g, ''); // Remove milliseconds and keep only digits
}

async function getHumanVersion() {
  const commitSha = getCommitSha();
  const tag = await getCommitTag();

  // If no commit tag, use the technical version since it's not a production deployment
  if (tag === commitSha) {
    return await getTechnicalVersion();
  } else {
    return tag;
  }
}

async function getTechnicalVersion() {
  const commitSha = getCommitSha();
  const revisionDate = await getGitRevisionDate();

  return `v${process.env.npm_package_version}-${revisionDate}-${commitSha.substring(0, 12)}`;
}

module.exports = {
  getFallbackCommitSha,
  getCommitSha,
  getRepositoryInformation,
  getFallbackCommitInformation,
  getFallbackCommitTag,
  getCommitTag,
  getGitRevisionDate,
  getHumanVersion,
  getTechnicalVersion,
};
