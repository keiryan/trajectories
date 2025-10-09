// scripts/validate.cjs
// Node: CommonJS (file is .cjs). Draft-07 schema.

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv").default;
const addFormats = require("ajv-formats");

const ROOT = process.cwd();
const TASKS_DIR = path.join(ROOT, "tasks");                 // new root
const SCHEMA_PATH = path.join(ROOT, "schemas", "messages.schema.json");

// policy toggles
const ENFORCE_DEPTH = true;              // require tasks/<group>/<task>/<file>.json
const REQUIRED_DEPTH = 3;                // relative to tasks/ -> group, task, file
const EXACTLY_ONE_JSON_PER_TASK = false; // set true if you want 1 json max in each task folder
const REQUIRE_MD_SIBLING = false;        // set true to require matching .md next to the .json

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`JSON parse error in ${rel(p)}: ${msg}`);
  }
}

function rel(p) {
  return path.relative(ROOT, p) || p;
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

function folderJsonPeerChecks(jsonPath) {
  const dir = path.dirname(jsonPath);
  const base = path.basename(jsonPath, ".json");
  const siblings = fs.readdirSync(dir);

  if (EXACTLY_ONE_JSON_PER_TASK) {
    const jsonCount = siblings.filter(n => /\.json$/i.test(n)).length;
    if (jsonCount !== 1) {
      throw new Error(
        `folder ${rel(dir)} must contain exactly 1 .json, found ${jsonCount}`
      );
    }
  }

  if (REQUIRE_MD_SIBLING) {
    const mdName = `${base}.md`;
    if (!siblings.includes(mdName)) {
      throw new Error(
        `${rel(jsonPath)} is missing required sibling .md file: ${mdName}`
      );
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
  // expected: [group, task, file.json]
}

function main() {
  if (!fs.existsSync(TASKS_DIR)) {
    console.error(`Missing tasks/ directory`);
    process.exit(1);
  }
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`Missing schemas/messages.schema.json`);
    process.exit(1);
  }

  const schema = readJson(SCHEMA_PATH);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  let bad = 0;
  for (const file of walk(TASKS_DIR)) {
    try {
      if (ENFORCE_DEPTH) depthCheck(file);
      folderJsonPeerChecks(file);

      const data = readJson(file);
      const ok = validate(data);
      if (!ok) {
        bad++;
        console.error(`\nX ${rel(file)}`);
        for (const err of validate.errors || []) {
          console.error(`  - ${err.instancePath || "(root)"} ${err.message}`);
          if (err.params) console.error(`    details: ${JSON.stringify(err.params)}`);
        }
      } else {
        console.log(`OK ${rel(file)}`);
      }
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
  console.log(`\nAll JSON files valid.`);
}

main();
