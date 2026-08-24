import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const candidateFiles = execFileSync(
	"git",
	["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
	{ encoding: "utf8" },
)
	.split("\0")
	.filter(Boolean);
const findings = [];

const forbiddenPaths = [
	/(^|\/)\.env($|\.)/,
	/(^|\/)runs\//,
	/(^|\/)\.ichabod\//,
	/\.pem$/,
	/(^|\/)id_rsa(?:\.pub)?$/,
];

const contentPatterns = [
	[
		"absolute home-directory path",
		/\/(?:Users\/[A-Za-z0-9._-]+|home\/(?!user(?:\/|$))[A-Za-z0-9._-]+)\//g,
	],
	["private key", new RegExp(["BEGIN ", "(?:RSA |EC |OPENSSH )?", "PRIVATE KEY"].join(""), "g")],
	["GitHub credential", new RegExp(["(?:ghp|github_pat)", "_[A-Za-z0-9_]{20,}"].join(""), "g")],
	["OpenAI-style credential", new RegExp(["s", "k-[A-Za-z0-9_-]{20,}"].join(""), "g")],
	["Google API credential", new RegExp(["AI", "za[0-9A-Za-z_-]{30,}"].join(""), "g")],
	["AWS access key", new RegExp(["AK", "IA[0-9A-Z]{16}"].join(""), "g")],
	["Slack credential", new RegExp(["xox", "[abprs]-[A-Za-z0-9-]{20,}"].join(""), "g")],
];

for (const path of candidateFiles) {
	if (forbiddenPaths.some((pattern) => pattern.test(path))) {
		findings.push(`forbidden tracked path: ${path}`);
	}

	let content;
	try {
		content = readFileSync(path, "utf8");
	} catch {
		continue;
	}
	if (content.includes("\0")) continue;

	for (const [label, pattern] of contentPatterns) {
		pattern.lastIndex = 0;
		if (pattern.test(content)) findings.push(`${label}: ${path}`);
	}
}

const extraTerms = (process.env.ICHABOD_BANNED_TERMS ?? "")
	.split(",")
	.map((term) => term.trim())
	.filter(Boolean);
for (const term of extraTerms) {
	for (const path of candidateFiles) {
		const content = readFileSync(path, "utf8");
		if (content.toLowerCase().includes(term.toLowerCase())) {
			findings.push(`configured banned term in ${path}`);
		}
	}
}

if (findings.length > 0) {
	console.error("Public-source audit failed:");
	for (const finding of findings) console.error(`- ${finding}`);
	process.exitCode = 1;
} else {
	console.log(`Public-source audit passed for ${candidateFiles.length} publishable files.`);
}
