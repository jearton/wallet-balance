import { writeFileSync } from "node:fs";
import { generateChangelog } from "./lib/changelog.mjs";

const tag = process.env.RELEASE_TAG;
const repository = process.env.GITHUB_REPOSITORY;
const digest = process.env.IMAGE_DIGEST;
if (!tag || !repository || !digest) throw new Error("Missing release metadata");
const image = `ghcr.io/${repository}:${tag.slice(1)}`;
const changelog = await generateChangelog({
  version: tag.slice(1),
  repository: `https://github.com/${repository}`,
});
const lines = [
  changelog,
  "",
  "## Container image",
  "",
  "Built and smoke-tested on native Linux amd64 and arm64 runners.",
  "",
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
