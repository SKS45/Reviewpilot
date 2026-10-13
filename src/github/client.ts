import { App } from "octokit";
import type { Config } from "../config.js";
import type { GitHubPort, ReviewJob } from "../review/types.js";

export function createGitHubApp(cfg: Pick<Config, "GITHUB_APP_ID" | "GITHUB_PRIVATE_KEY">): App {
  return new App({
    appId: cfg.GITHUB_APP_ID,
    // Allow the PEM to be stored in a single-line env var with literal "\n" sequences.
    privateKey: cfg.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n"),
  });
}

/** Adapts an installation-scoped Octokit client to the small port the review pipeline uses. */
export async function githubPortFor(app: App, job: ReviewJob): Promise<GitHubPort> {
  const octokit = await app.getInstallationOctokit(job.installationId);
  const pr = { owner: job.owner, repo: job.repo, pull_number: job.pullNumber };

  return {
    async listPullFiles() {
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, { ...pr, per_page: 100 });
      return files.map((f) => ({ filename: f.filename, status: f.status, patch: f.patch }));
    },

    async getHeadSha() {
      const { data } = await octokit.rest.pulls.get(pr);
      return data.head.sha;
    },

    async postReview({ headSha, body, comments }) {
      await octokit.rest.pulls.createReview({
        ...pr,
        commit_id: headSha,
        event: "COMMENT",
        body,
        comments,
      });
    },
  };
}
