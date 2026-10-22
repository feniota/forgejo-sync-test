import { execFileSync } from "node:child_process";

const env = process.env;

const required = [
  "FORGEJO_BASE_URL",
  "FORGEJO_OWNER",
  "FORGEJO_REPO",
  "FORGEJO_TOKEN",
  "FORGEJO_OPERATOR",
];

for (const name of required) {
  if (!env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const {
  FORGEJO_BASE_URL,
  FORGEJO_OWNER,
  FORGEJO_REPO,
  FORGEJO_TOKEN,
  FORGEJO_OPERATOR,
} = env;

const SOURCE_BRANCH = "github";
const TARGET_BRANCH = "main";

const base_url = new URL(FORGEJO_BASE_URL);
const api_url = new URL(
  `/api/v1/repos/${FORGEJO_OWNER}/${FORGEJO_REPO}/`,
  base_url,
);
const git_url = new URL(`/${FORGEJO_OWNER}/${FORGEJO_REPO}.git`, base_url);
git_url.username = FORGEJO_OPERATOR;
git_url.password = FORGEJO_TOKEN;

function git(...args) {
  const redacted_args = args.map((elem) =>
    elem
      .replaceAll(FORGEJO_OPERATOR, "[OPERATOR]")
      .replaceAll(FORGEJO_TOKEN, "[TOKEN]")
  );
  console.log(`+ git ${redacted_args.join(" ")}`);

  execFileSync("git", args, {
    stdio: "inherit",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
    },
  });
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `token ${FORGEJO_TOKEN}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Forgejo API ${response.status} ${response.statusText}: ${text}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

async function main() {
  // Push the exact GitHub branch history to Forgejo.
  // A normal push deliberately refuses unexpected history rewrites.
  git("remote", "add", "forgejo", git_url.toString());

  git(
    "push",
    "forgejo",
    `refs/heads/${SOURCE_BRANCH}:refs/heads/${SOURCE_BRANCH}`,
  );

  // Find an existing open PR for this branch.
  const find_pr_url = new URL("pulls", api_url);
  find_pr_url.searchParams.append("state", "open");
  find_pr_url.searchParams.append("head", `${FORGEJO_OWNER}:${SOURCE_BRANCH}`);
  find_pr_url.searchParams.append("base", TARGET_BRANCH);
  find_pr_url.searchParams.append("limit", "50");
  const existing = await api(find_pr_url);

  if (existing.length === 1) {
    const pr = existing[0];

    console.log(`Forgejo PR #${pr.number} is already open: ${pr.html_url}`);
    console.log("Its head branch has been updated by the Git push.");
    return;
  } else if (existing.length > 1) {
    console.error("Forgejo returned multiple matching PRs. Aborting...");
    process.exit(1);
  }

  // No open PR exists. Create one.
  const payload = {
    title: "Import GitHub contributions",
    head: SOURCE_BRANCH,
    base: TARGET_BRANCH,
    body: [
      "This PR synchronizes the public contribution branch from GitHub.",
      "",
      "Source: GitHub `" + SOURCE_BRANCH + "` branch.",
      "Target: Forgejo `" + TARGET_BRANCH + "`.",
    ].join("\n"),
  };

  const pr = await api(new URL("pulls", api_url), {
    method: "POST",
    body: JSON.stringify(payload),
  });

  console.log(`Created Forgejo PR #${pr.number}: ${pr.html_url}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
