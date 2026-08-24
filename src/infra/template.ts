/**
 * infra/template.ts — Simple {{variable}} template substitution.
 *
 * Used by batch to apply a prompt template to each item.
 * Intentionally simple — no conditionals, no loops, no escaping.
 * If you need more, use a template function instead.
 */

/**
 * Replace `{{key}}` placeholders in a template string with values from a data object.
 *
 * - Keys are matched case-sensitively
 * - Whitespace around key name is trimmed: `{{ key }}` works
 * - Missing keys are left as-is (no error, no empty string)
 * - Values are converted to string via String()
 *
 * @example
 * ```ts
 * renderTemplate("Hello {{name}}, you have {{count}} items", { name: "Alice", count: 3 })
 * // → "Hello Alice, you have 3 items"
 * ```
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
	return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
		if (key in data) {
			return String(data[key]);
		}
		return match; // Leave unmatched placeholders as-is
	});
}
