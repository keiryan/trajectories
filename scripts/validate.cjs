// Usage: node scripts/validate.js
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv").default;
const addFormats = require("ajv-formats");

const ROOT = process.cwd();
const FORMS_DIR = path.join(ROOT, "tasks");
const SCHEMA_PATH = path.join(ROOT, "schemas", "messages.schema.json");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`JSON parse error in ${p}: ${msg}`);
  }
}

function* walkJsonFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walkJsonFiles(p);
    else if (ent.isFile() && /\.json$/i.test(ent.name)) yield p;
  }
}

function main() {
  if (!fs.existsSync(FORMS_DIR)) {
    console.error("Missing tasks/ directory");
    process.exit(1);
  }
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error("Missing schemas/messages.schema.json");
    process.exit(1);
  }

  const schema = readJson(SCHEMA_PATH);
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  let bad = 0;
  for (const file of walkJsonFiles(FORMS_DIR)) {
    try {
      const data = readJson(file);
      const ok = validate(data);
      if (!ok) {
        bad++;
        console.error(`\nX ${file}`);
        for (const err of validate.errors || []) {
          console.error(`  - ${err.instancePath || "(root)"} ${err.message}`);
          if (err.params) console.error(`    details: ${JSON.stringify(err.params)}`);
        }
      } else {
        console.log(`OK ${file}`);
      }
    } catch (e) {
      bad++;
      console.error(`\nX ${file}`);
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
