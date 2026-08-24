import { describe, expect, it } from "vitest";
import { codexAdapter } from "../../src/providers/codex/adapter.js";

describe("codexAdapter", () => {
	it("parses JSONL output into a successful dispatch result", () => {
		const result = codexAdapter.parse({
			stdout: [
				'{"type":"thread.started","thread_id":"thread-123"}',
				'{"type":"turn.started"}',
				'{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"Thinking"}}',
				'{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"{\\"answer\\":\\"pong\\"}"}}',
				'{"type":"turn.completed","usage":{"input_tokens":18380,"cached_input_tokens":4480,"output_tokens":46}}',
			].join("\n"),
			stderr: "",
			exitCode: 0,
			timedOut: false,
		});

		expect(result.ok).toBe(true);
		expect(result.result).toBe('{"answer":"pong"}');
		expect(result.sessionId).toBe("thread-123");
		expect(result.usage.inputTokens).toBe(18380);
		expect(result.usage.cacheReadTokens).toBe(4480);
		expect(result.usage.outputTokens).toBe(46);
	});

	it("returns an execution error when JSONL cannot be parsed", () => {
		const result = codexAdapter.parse({
			stdout: "not-jsonl",
			stderr: "",
			exitCode: 1,
			timedOut: false,
		});

		expect(result.ok).toBe(false);
		expect(result.errors[0]).toContain("Could not parse Codex JSONL output");
	});
});
