import { commitTypes } from "./scripts/lib/commit-convention.mjs";

export default {
  extends: ["@commitlint/config-conventional"],
  defaultIgnores: false,
  plugins: [
    {
      rules: {
        "subject-emoji": ({ type, subject }) => {
          const definition = commitTypes.find((entry) => entry.type === type);
          return [
            Boolean(
              definition &&
              subject?.startsWith(`${definition.emoji} `) &&
              subject.slice(definition.emoji.length + 1).trim(),
            ),
            `Subject must start with the emoji for its type (e.g. feat: ✨ add feature). Use npm run commit.`,
          ];
        },
      },
    },
  ],
  rules: {
    "type-enum": [2, "always", commitTypes.map(({ type }) => type)],
    "subject-case": [0],
    "subject-emoji": [2, "always"],
  },
  prompt: {
    useEmoji: true,
    emojiAlign: "center",
    types: commitTypes.map(({ type, emoji, section }) => ({
      value: type,
      emoji,
      name: `${emoji} ${type}: ${section}`,
    })),
    scopes: ["wallet", "balances", "history", "pwa", "ui", "server", "tooling", "release"],
    markBreakingChangeMode: true,
    allowBreakingChanges: commitTypes.map(({ type }) => type),
    maxHeaderLength: 100,
  },
};
