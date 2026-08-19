// Reading optional environment overrides.
//
// GitHub Actions substitutes an empty string for an unset `vars.*`, so `??` is the
// wrong operator for anything a workflow may or may not set: it treats "" as a real
// value and the default never applies. For the upstream guards that is not a cosmetic
// bug — an empty OPENBOT_EAS_PROJECT_ID would make the official EAS project look like
// a fork's and skip the refusal entirely.

/** The variable's value, or undefined when it is unset, empty, or only whitespace. */
export function optionalEnvironment(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const value = environment[name]?.trim();
  return value === "" ? undefined : value;
}
