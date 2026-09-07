import { readFile } from "node:fs/promises";
export const tildePlatformSkillNames = [
  "tilde-connectors",
  "tilde-tools",
  "tilde-chatkit",
  "tilde-memory",
  "tilde-skills",
  "tilde-state",
  "tilde-dev-tunnels",
  "tilde-control-plane",
] as const;
export const tildePlatformSkillTemplates = tildePlatformSkillNames.map(
  (name) =>
    [
      `skills/${name}/SKILL.md`,
      new URL(`./assets/platform-skills/${name}/SKILL.md.hbs`, import.meta.url).href,
    ] as const,
);
export async function mandatoryTildeSkills(agentId: string) {
  return Promise.all(
    tildePlatformSkillTemplates.map(async ([key, url], index) => {
      const content = await readFile(new URL(url), "utf8");
      const name = tildePlatformSkillNames[index]!;
      const description = /^description: (.+)$/m.exec(content)?.[1] ?? name;
      return {
        key: `platform/${agentId}/${key}`,
        name: `${agentId}-${name}`,
        description,
        content,
      };
    }),
  );
}
