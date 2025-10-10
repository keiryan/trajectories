// scripts/validate.cjs - CommonJS
// - If CHANGED_FILES env var is set (JSON array), validate only those files and enforce strict non-empty fields.
// - Otherwise, validate all tasks/**/*.json with the lenient schema.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv").default;
const addFormats = require("ajv-formats");

const ROOT = process.cwd();
const TASKS_DIR = path.join(ROOT, "tasks");
const SCHEMA_PATH = path.join(ROOT, "schemas", "messages.schema.json");

// folder rules (optional - keep as you like)
const ENFORCE_DEPTH = true;   // tasks/<group>/<task>/<file>.json
const REQUIRED_DEPTH = 3;

function rel(p) {
  return path.relative(ROOT, p) || p;
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`JSON parse error in ${rel(p)}: ${msg}`);
  }
}

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(p);
    } else if (ent.isFile() && /\.json$/i.test(ent.name)) {
      yield p;
    }
  }
}

function depthCheck(jsonPath) {
  const relFromTasks = path.relative(TASKS_DIR, jsonPath);
  const parts = relFromTasks.split(path.sep);
  if (parts.length < REQUIRED_DEPTH) {
    throw new Error(
      `${rel(jsonPath)} must be at least ${REQUIRED_DEPTH} levels under tasks/ (got ${parts.length})`
    );
  }
}

function strictNonEmptyCheck(data, filePath) {
  const where = rel(filePath);

  if (!data || !Array.isArray(data.messages)) {
    throw new Error(`${where}: root must have "messages" array`);
  }

  const errors = [];
  let checkedCount = 0;

  data.messages.forEach((m, i) => {
    // Exempt any system messages from annotation requirements
    if (m && m.role === "system") return;

    checkedCount++;

    const cc = typeof m?.contentClassification === "string" ? m.contentClassification.trim() : "";
    const ce = typeof m?.classificationExplanation === "string" ? m.classificationExplanation.trim() : "";

    if (!cc) errors.push(`messages[${i}].contentClassification is empty`);
    if (!ce) errors.push(`messages[${i}].classificationExplanation is empty`);
  });

  // Optional: if you want at least one non-system message to be annotated, uncomment below
  // if (checkedCount === 0) errors.push("no non-system messages to check");

  if (errors.length) {
    throw new Error(`${where}: strict checks failed - ${errors.join("; ")}`);
  }
}


function main() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error("Missing schemas/messages.schema.json");
    process.exit(1);
  }

  // Decide target set
  let targets = [];
  const changedEnv = process.env.CHANGED_FILES;
  const hasChangedList = changedEnv && changedEnv !== "[]" && changedEnv !== "";

  if (hasChangedList) {
    const list = JSON.parse(changedEnv);
    targets = list
      .filter(p => p.startsWith("tasks/") && p.endsWith(".json"))
      .map(p => path.join(ROOT, p))
      .filter(p => fs.existsSync(p));
    if (targets.length === 0) {
      console.log("No changed JSON files to validate.");
      return;
    }
  } else {
    if (!fs.existsSync(TASKS_DIR)) {
      console.error("Missing tasks/ directory");
      process.exit(1);
    }
    targets = Array.from(walk(TASKS_DIR));
    if (targets.length === 0) {
      console.log("No JSON files under tasks/.");
      return;
    }
  }

  // AJV lenient validation first
  const schema = readJson(SCHEMA_PATH);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  let bad = 0;
  for (const file of targets) {
    try {
      if (ENFORCE_DEPTH) depthCheck(file);

      const data = readJson(file);
      const ok = validate(data);
      if (!ok) {
        bad++;
        console.error(`\nX ${rel(file)}`);
        for (const err of validate.errors || []) {
          console.error(`  - ${err.instancePath || "(root)"} ${err.message}`);
          if (err.params) console.error(`    details: ${JSON.stringify(err.params)}`);
        }
        continue;
      }

      // If we are in "changed files" mode, enforce strict non-empty fields
      if (hasChangedList) {
        strictNonEmptyCheck(data, file);
      }

      console.log(`OK ${rel(file)}`);
    } catch (e) {
      bad++;
      console.error(`\nX ${rel(file)}`);
      console.error(`  - ${e.message}`);
    }
  }

  if (bad) {
    console.error(`\nFailed: ${bad} file(s) invalid`);
    process.exit(2);
  }
  console.log("\nAll JSON files valid.");
}

main();
