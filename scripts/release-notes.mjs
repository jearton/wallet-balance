import { writeFileSync } from "node:fs";

const tag = process.env.RELEASE_TAG;
const repository = process.env.GITHUB_REPOSITORY;
const digest = process.env.IMAGE_DIGEST;
if (!tag || !repository || !digest) throw new Error("Missing release metadata");
const image = `ghcr.io/${repository}:${tag.slice(1)}`;
const lines = [
  `## Wallet Balance ${tag}`,
  "",
  "TypeScript application with encrypted SQLite history, 13-chain balance queries and PWA support.",
  "",
  "- Type checks, ESLint, Prettier and automated tests passed.",
  "- Container built and smoke-tested on native Linux amd64 and arm64 runners.",
  `- Image: \`${image}\``,
  `- Digest: \`${digest}\``,
  "",
  "```sh",
  `docker pull ${image}`,
  "```",
  "",
  "See the README for deployment and data-access boundaries.",
  "",
];
writeFileSync("/tmp/release-notes.md", lines.join("\n"));
