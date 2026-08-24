#!/usr/bin/env node
import { buildProgram } from "../dist/cli.js";

await buildProgram().parseAsync(process.argv);
