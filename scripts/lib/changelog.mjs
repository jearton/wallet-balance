import { execFileSync } from "node:child_process";
import { ConventionalChangelog } from "conventional-changelog";
import { commitTypes } from "./commit-convention.mjs";

export async function generateChangelog({ cwd = process.cwd(), version, repository }) {
  if (!/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(version))
    throw new Error("Invalid release version");
  const git = (args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git(["rev-parse", "--is-shallow-repository"]) === "true")
    throw new Error("Changelog requires full Git history (fetch-depth: 0)");
  const currentTag = `v${version}`;
  let to = "HEAD";
  try {
    git(["rev-parse", "--verify", `refs/tags/${currentTag}`]);
    to = currentTag;
  } catch {
    /* Preparing an untagged release. */
  }
  let from;
  try {
    from = git([
      "describe",
      "--tags",
      "--abbrev=0",
      "--match",
      "v[0-9]*",
      to === currentTag ? `${to}^` : to,
    ]);
  } catch {
    /* Initial release includes all commits. */
  }
  const generator = new ConventionalChangelog(cwd)
    .repository(repository)
    .package({ version })
    .tags({ prefix: "v" })
    .commits({ from, to })
    .loadPreset({
      name: "conventionalcommits",
      types: commitTypes.map(({ type, section }) => ({ type, section })),
    })
    .context({ version, currentTag, previousTag: from })
    .options({ releaseCount: 1, outputUnreleased: false })
    .writer({ doFlush: true, generateOn: () => false });
  let markdown = "";
  for await (const chunk of generator.write()) markdown += chunk;
  return markdown.trim();
}
