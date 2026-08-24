import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const temporaryRoot = mkdtempSync(join(tmpdir(), "ichabod-package-"));
const packDirectory = join(temporaryRoot, "pack");
const consumerDirectory = join(temporaryRoot, "consumer");
const npmCacheDirectory = join(temporaryRoot, "npm-cache");

try {
	mkdirSync(packDirectory, { recursive: true });
	mkdirSync(consumerDirectory, { recursive: true });
	execFileSync("pnpm", ["pack", "--pack-destination", packDirectory], {
		cwd: root,
		stdio: "inherit",
	});

	const tarballName = readdirSync(packDirectory).find((name) => name.endsWith(".tgz"));
	if (!tarballName) {
		throw new Error("pnpm pack did not produce a tarball");
	}

	const tarballPath = join(packDirectory, tarballName);
	const entries = execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" });
	for (const required of [
		"package/dist/index.js",
		"package/dist/index.d.ts",
		"package/dist/cli.js",
		"package/skills/ichabod/SKILL.md",
		"package/skills/ichabod/references/cli-workflows.md",
		"package/skills/ichabod/references/output-contracts.md",
		"package/skills/ichabod/references/provider-behavior.md",
	]) {
		if (!entries.split("\n").includes(required)) {
			throw new Error(`Packed tarball is missing ${required}`);
		}
	}

	writeFileSync(
		join(consumerDirectory, "package.json"),
		JSON.stringify({ name: "ichabod-package-smoke", private: true, type: "module" }),
	);
	execFileSync(
		"npm",
		[
			"install",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--cache",
			npmCacheDirectory,
			tarballPath,
		],
		{
			cwd: consumerDirectory,
			stdio: "inherit",
		},
	);

	const installedPackageDirectory = join(
		consumerDirectory,
		"node_modules",
		...sourceManifest.name.split("/"),
	);
	const cliOutput = execFileSync(
		join(consumerDirectory, "node_modules", ".bin", "ichabod"),
		["--version"],
		{ encoding: "utf8" },
	).trim();
	if (cliOutput !== sourceManifest.version) {
		throw new Error(
			`Expected CLI version ${sourceManifest.version}, received ${JSON.stringify(cliOutput)}`,
		);
	}

	const apiProbe = join(consumerDirectory, "probe.mjs");
	writeFileSync(
		apiProbe,
		`import { create } from ${JSON.stringify(sourceManifest.name)};\nif (typeof create !== "function") process.exit(1);\n`,
	);
	execFileSync(process.execPath, [apiProbe], { cwd: consumerDirectory, stdio: "inherit" });

	const installedManifest = JSON.parse(
		readFileSync(join(installedPackageDirectory, "package.json"), "utf8"),
	);
	console.log(
		`Verified ${installedManifest.name}@${installedManifest.version} from ${tarballName}`,
	);
} finally {
	rmSync(temporaryRoot, { recursive: true, force: true });
}
