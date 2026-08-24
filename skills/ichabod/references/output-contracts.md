# Output contracts and validation

Read this reference when designing a schema, interpreting a result, or deciding
whether Ichabod locally validates a JSON Schema feature.

## Contract boundary

An output contract combines a JSON Schema with a stable name and schema hash.
Provider adapters use their strongest native structured-output mechanism, then
Ichabod normalizes the returned value and applies the same local validator.

For CLI work, `--json-schema` and `--schema` accept an inline schema or a path to
a JSON file. For TypeScript work, `createOutputContract` accepts a JSON string or
object.

## Locally validated subset

Ichabod currently validates:

- `type`, including an array of allowed types;
- `enum` and `const`;
- `minLength` and `maxLength` for strings;
- `minimum` and `maximum` for numbers;
- `minItems`, `maxItems`, and one object-form `items` schema for arrays;
- `properties`, `required`, and `additionalProperties: false` for objects.

Do not assume the local validator enforces unlisted keywords such as `pattern`,
`format`, `oneOf`, `anyOf`, `$ref`, or conditional schemas. A provider may accept
or enforce more than Ichabod validates locally; that is not parity.

## Validation states

- `valid`: a structured value was recovered and no local validation or execution
  errors were recorded.
- `invalid`: a value was recovered, but schema or execution errors remain.
- `unparseable`: no structured value could be recovered from the native field or
  response text.

Prefer the provider's explicit structured-output field when it exists. Raw text
may contain commentary, code fences, or provider UI metadata even when the
explicit structured value is clean.

## Design guidance

- Make required fields explicit.
- Use `additionalProperties: false` when downstream code requires an exact shape.
- Start with the smallest schema that represents the actual consumer contract.
- Do not ask a model to emit numeric `confidence` unless the surrounding system
  has a real calibration method.
- Separate structural validation from factual, semantic, safety, or quality
  review.
- Preserve the schema hash and provider provenance when results will be compared
  or reused.
