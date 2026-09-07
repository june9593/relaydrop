import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const notices = new Map();

function locatePackage(name, start) {
  for (let directory = start; ; directory = dirname(directory)) {
    const file = join(directory, "node_modules", name, "package.json");
    if (existsSync(file)) return realpathSync(file);
    if (dirname(directory) === directory) {
      throw new Error(`Install dependencies before generating notices: ${name}`);
    }
  }
}

function visit(name, start) {
  const file = locatePackage(name, start);
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const key = `${pkg.name}@${pkg.version}`;
  if (notices.has(key)) return;
  const directory = dirname(file);
  const licenseFiles = readdirSync(directory)
    .filter((name) => /^(license|licence|copying|notice)(\.|$)/i.test(name))
    .sort();
  if (licenseFiles.length === 0) throw new Error(`Missing license text for ${key}`);
  notices.set(key, licenseFiles.map((name) => readFileSync(join(directory, name), "utf8")).join("\n\n").trim());
  for (const dependency of Object.keys(pkg.dependencies ?? {}).sort()) {
    visit(dependency, directory);
  }
}

for (const name of Object.keys(manifest.dependencies).sort()) visit(name, root);

// These modules are emitted by the configured generateSW PWA build. Include
// their dependency licenses as well as the application's production packages.
const pwaDirectory = dirname(locatePackage("vite-plugin-pwa", root));
const workboxDirectory = dirname(locatePackage("workbox-build", pwaDirectory));
for (const name of ["workbox-core", "workbox-precaching", "workbox-routing", "workbox-strategies"]) {
  visit(name, workboxDirectory);
}

const text = [
  "RelayDrop third-party notices",
  "",
  "The web application and browser extension use the components listed below.",
  "Some components apply only to one of these distributions. Their copyright",
  "and license texts are reproduced from the installed, locked packages.",
  "These third-party licenses do not grant a license to RelayDrop's own source.",
  "",
  ...[...notices.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, license]) => [
    "=".repeat(72), name, "=".repeat(72), "", license, ""
  ])
].join("\n").trimEnd() + "\n";

for (const directory of ["public", "extension/public"]) {
  const target = join(root, directory, "THIRD_PARTY_NOTICES.txt");
  if (process.argv.includes("--check")) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== text) {
      throw new Error(`Third-party notices are stale. Run pnpm notices:generate.`);
    }
  } else {
    writeFileSync(target, text);
  }
  const projectLicense = readFileSync(join(root, "LICENSE"), "utf8");
  const licenseTarget = join(root, directory, "LICENSE.txt");
  if (process.argv.includes("--check")) {
    if (!existsSync(licenseTarget) || readFileSync(licenseTarget, "utf8") !== projectLicense) {
      throw new Error("Project license copies are stale. Run pnpm notices:generate.");
    }
  } else {
    writeFileSync(licenseTarget, projectLicense);
  }
}
console.log(`Third-party notices ${process.argv.includes("--check") ? "verified" : "generated"}: ${notices.size} packages.`);
