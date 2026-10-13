# ReviewPilot

A GitHub App that reviews pull requests with an LLM and posts inline comments on the diff.

```
GitHub ──webhook──▶ Express ──enqueue──▶ Redis (BullMQ) ──▶ Worker ──▶ LLM provider
 (PR opened/pushed)  verify HMAC          1 job per PR SHA     │         Gemini | Groq | Ollama
                     filter events                             ▼
                                                      parse diffs → prompt → validate
                                                      → one inline review on the PR
```

## Design decisions

- **Webhook returns fast, work happens in a queue.** Large PRs and slow models never hit GitHub's webhook timeout.
- **Idempotent jobs.** The job id is `owner/repo#number@headSha`, so redelivered webhooks don't trigger duplicate reviews.
- **Signature verified on the raw bytes** with a constant-time compare.
- **Comments are validated against the diff before posting.** GitHub rejects the whole review (HTTP 422) if one comment points at a line outside the diff, so LLM line numbers are checked against the parsed patch first.
- **Stale-review guard.** If a newer commit was pushed while the model was running, the review is dropped; the new push has its own job.
- **Partial failure tolerance.** One bad file doesn't sink the PR. The job only fails (and retries with backoff) when every file failed.
- **Provider interface.** `LLMProvider` has one method; switching Gemini/Groq/Ollama (or a paid model) is an env var.
- **Untrusted input.** PR titles and diffs are treated as data in the system prompt, not instructions.

## Setup

Requires Node 20+, Docker, and a free LLM key (or Ollama).

```bash
npm install express bullmq ioredis octokit zod dotenv
npm install -D typescript tsx @types/express @types/node

cp .env.example .env
docker compose up -d        # Postgres+pgvector and Redis
```

### 1. Create the GitHub App

GitHub → Settings → Developer settings → GitHub Apps → New:

- **Webhook URL:** your smee.io channel (see below); **Webhook secret:** any random string, same as `GITHUB_WEBHOOK_SECRET`
- **Permissions:** Pull requests: Read & write · Contents: Read · Metadata: Read
- **Subscribe to events:** Pull request
- Create it, note the **App ID**, generate a **private key** (.pem) and put it in `GITHUB_PRIVATE_KEY`
- Install the app on a test repository

### 2. Forward webhooks to localhost

```bash
npx smee-client --url https://smee.io/<your-channel> --target http://localhost:3000/webhook
```

### 3. Pick an LLM

Set `LLM_PROVIDER` in `.env`:

| Provider | Needs | Notes |
| --- | --- | --- |
| `gemini` | `GEMINI_API_KEY` (free tier) | rate-limited |
| `groq` | `GROQ_API_KEY` (free tier) | rate-limited |
| `ollama` | local Ollama running | `ollama pull qwen2.5-coder:7b`; fully offline |

Model names change often. Check each provider's docs and update `*_MODEL`. Free tiers may use prompts for training, so only point this at your own or public repos.

### 4. Run

```bash
npm run dev          # webhook server  (terminal 1)
npm run dev:worker   # review worker   (terminal 2)
```

Open a PR on the test repo. Comments appear after the worker finishes.

## Scripts

| | |
| --- | --- |
| `npm test` | unit tests (Node's built-in test runner, no extra deps) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `start` / `start:worker` | compile and run in production |

## Roadmap

- [ ] Repo context retrieval (embeddings in pgvector; the `reviews` table and extension are already provisioned in `db/init.sql`)
- [ ] `.reviewpilot.yml` per-repo config (ignored paths, rules, severity thresholds)
- [ ] File-level caching and per-PR cost tracking (token counts are already collected per review)
- [ ] Evaluation harness: 50+ PRs with known bugs, scoring precision and recall
- [ ] Dashboard with review history and 👍/👎 feedback
- [ ] Reply to developers' follow-up comments
