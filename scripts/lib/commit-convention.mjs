export const commitTypes = [
  { type: "feat", emoji: "✨", section: "Features" },
  { type: "fix", emoji: "🐛", section: "Bug Fixes" },
  { type: "docs", emoji: "📝", section: "Documentation" },
  { type: "style", emoji: "💄", section: "Styles" },
  { type: "refactor", emoji: "♻️", section: "Refactoring" },
  { type: "perf", emoji: "⚡️", section: "Performance" },
  { type: "test", emoji: "✅", section: "Tests" },
  { type: "build", emoji: "📦️", section: "Build System" },
  { type: "ci", emoji: "👷", section: "Continuous Integration" },
  { type: "chore", emoji: "🔧", section: "Maintenance" },
  { type: "revert", emoji: "⏪️", section: "Reverts" },
];

export function addCommitEmoji(message) {
  return message.replace(
    /^(\w+)(\([^\r\n()]+\))?(!)?: ([^\r\n]+)/,
    (header, type, scope = "", breaking = "", subject) => {
      const definition = commitTypes.find((entry) => entry.type === type);
      if (!definition || /^\p{Extended_Pictographic}/u.test(subject)) return header;
      return `${type}${scope}${breaking}: ${definition.emoji} ${subject}`;
    },
  );
}
