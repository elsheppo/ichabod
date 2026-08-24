import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["tests/**/*.test.ts"],
		exclude: ["tests/integration/**"],
		coverage: {
			include: ["src/**/*.ts"],
			exclude: ["src/cli.ts", "src/commands/**"],
		},
	},
});
