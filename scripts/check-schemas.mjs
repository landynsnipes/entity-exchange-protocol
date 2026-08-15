import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const committedDirectory = resolve(repositoryRoot, "schemas");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "exp-schemas-"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  execFileSync(npmCommand, ["run", "generate:schemas"], {
    cwd: repositoryRoot,
    env: { ...process.env, EXP_SCHEMA_OUTPUT_DIR: temporaryDirectory },
    stdio: "inherit",
  });

  const committedFiles = readdirSync(committedDirectory).filter((file) => file.endsWith(".json")).sort();
  const generatedFiles = readdirSync(temporaryDirectory).filter((file) => file.endsWith(".json")).sort();
  const missing = generatedFiles.filter((file) => !committedFiles.includes(file));
  const extra = committedFiles.filter((file) => !generatedFiles.includes(file));
  const changed = generatedFiles.filter((file) => committedFiles.includes(file)
    && !readFileSync(join(temporaryDirectory, file)).equals(readFileSync(join(committedDirectory, file))));

  if (missing.length > 0 || extra.length > 0 || changed.length > 0) {
    if (missing.length > 0) console.error(`Missing committed schemas: ${missing.join(", ")}`);
    if (extra.length > 0) console.error(`Extra committed schemas: ${extra.join(", ")}`);
    if (changed.length > 0) console.error(`Changed committed schemas: ${changed.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Schema check passed: ${committedFiles.length} committed artifacts are synchronized.`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
