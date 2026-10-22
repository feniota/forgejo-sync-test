import { execFileSync } from "node:child_process";
const env = process.env;

const required = [
  "GH_PUSH_REPO",
  "GH_PUSH_USER",
  "GH_PUSH_TOKEN",
];

for (const name of required) {
  if (!env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const {
  GH_PUSH_REPO,
  GH_PUSH_USER,
  GH_PUSH_TOKEN,
} = env;

function git(...args) {
  const redacted_args = args.map((elem) =>
    elem
      .replaceAll(GH_PUSH_USER, "[USER]")
      .replaceAll(GH_PUSH_TOKEN, "[TOKEN]")
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

const git_url = new URL(GH_PUSH_REPO);
git_url.username = GH_PUSH_USER;
git_url.password = GH_PUSH_TOKEN;

git("remote", "add", "github", git_url.toString());
git("push", "github", "refs/heads/main:refs/heads/main");
