import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const skillPath = resolve("skills/ichabod/SKILL.md");
const source = readFileSync(skillPath, "utf8");
const match = source.match(/^---\n([\s\S]*?)\n---\n/);

if (!match) throw new Error(`${skillPath} is missing YAML frontmatter`);

const frontmatter = match[1];
if (!/^name:\s+ichabod$/m.test(frontmatter)) {
	throw new Error(`${skillPath} must declare name: ichabod`);
}
if (!/^description:\s+\S.+$/m.test(frontmatter)) {
	throw new Error(`${skillPath} must declare a non-empty description`);
}
if (/\b(?:TODO|TBD|PLACEHOLDER)\b/i.test(source)) {
	throw new Error(`${skillPath} contains unfinished scaffold text`);
}

for (const required of [
	"skills/ichabod/references/cli-workflows.md",
	"skills/ichabod/references/output-contracts.md",
	"skills/ichabod/references/provider-behavior.md",
]) {
	if (!existsSync(resolve(required)))
		throw new Error(`Missing required skill resource: ${required}`);
}

console.log(`Validated ${skillPath}`);
