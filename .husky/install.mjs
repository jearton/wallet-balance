if (
  process.env.CI !== "true" &&
  process.env.NODE_ENV !== "production" &&
  process.env.HUSKY !== "0"
) {
  const { default: husky } = await import("husky");
  const message = husky();
  if (message) throw new Error(message);
}
