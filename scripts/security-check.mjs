import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = process.cwd();
const includeHistory = process.argv.includes("--history");
const failures = [];

const trackedFiles = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8"
})
  .split("\0")
  .filter(Boolean);

const binaryExtensions = new Set([".ico", ".jpg", ".jpeg", ".png", ".webp", ".woff2"]);
const currentTree = trackedFiles
  .filter(
    (file) =>
      file !== "scripts/security-check.mjs" &&
      existsSync(resolve(root, file)) &&
      !binaryExtensions.has(extname(file).toLowerCase())
  )
  .map((file) => `${file}\n${readFileSync(resolve(root, file), "utf8")}`)
  .join("\n");
const currentEmailTree = trackedFiles
  .filter(
    (file) =>
      file !== "pnpm-lock.yaml" &&
      file !== "scripts/security-check.mjs" &&
      existsSync(resolve(root, file)) &&
      !binaryExtensions.has(extname(file).toLowerCase())
  )
  .map((file) => `${file}\n${readFileSync(resolve(root, file), "utf8")}`)
  .join("\n");

const privacyPatterns = [
  { label: "a machine-local absolute path", pattern: /(?:\/Users\/[\w.-]+\/|\/home\/[\w.-]+\/|[A-Z]:\\Users\\[\w.-]+\\)/ },
  { label: "a concrete Azure Static Web Apps generated hostname", pattern: /https:\/\/[a-z0-9-]+\.\d+\.azurestaticapps\.net\b/i },
  {
    label: "a private/company npm registry URL",
    pattern: /(?:pkgs\.visualstudio\.com\/.+\/_packaging\/|packagefeedproxy\.microsoft\.io\/npm)/i
  }
];

const secretPatterns = [
  { label: "a private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "a GitHub token", pattern: /(?:github_pat_|gh[opusr]_)[A-Za-z0-9_]{20,}/ },
  { label: "a JWT-like bearer token", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    label: "a literal production client ID in the deployment workflow",
    pattern: /VITE_MICROSOFT_CLIENT_ID:\s*[0-9a-f]{8}-[0-9a-f-]{27}\b/i
  },
  {
    label: "a literal Azure deployment token",
    pattern: /azure_static_web_apps_api_token:\s*(?!\$\{\{\s*secrets\.)\S+/i
  }
];

scan("Tracked files", currentTree, [...privacyPatterns, ...secretPatterns]);
scanEmails("Tracked files", currentEmailTree);
scanPrivateTerms("Tracked files", currentTree);

const trackedEnvironmentFiles = trackedFiles.filter(
  (file) => /(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example"
);
if (trackedEnvironmentFiles.length > 0) {
  failures.push(`Tracked environment files: ${trackedEnvironmentFiles.join(", ")}`);
}

checkExtensionManifest();
checkStaticHostHeaders();
checkLocalScripts();
checkWorkflowActions();
checkBuildOutput();

if (includeHistory) checkHistory();

if (failures.length > 0) {
  console.error("RelayDrop security check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `RelayDrop security check passed (${trackedFiles.length} tracked files${
    includeHistory ? ", including Git history" : ""
  }).`
);

function scan(scope, content, patterns) {
  for (const { label, pattern } of patterns) {
    if (pattern.test(content)) failures.push(`${scope} contain ${label}.`);
  }
}

function checkExtensionManifest() {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "extension/public/manifest.json"), "utf8")
  );
  const forbiddenPermissions = [
    "activeTab",
    "bookmarks",
    "clipboardRead",
    "clipboardWrite",
    "contentSettings",
    "history",
    "management",
    "nativeMessaging",
    "tabs",
    "webRequestBlocking"
  ];
  const requestedPermissions = new Set(manifest.permissions ?? []);
  const unexpected = forbiddenPermissions.filter((permission) =>
    requestedPermissions.has(permission)
  );
  if (unexpected.length > 0) {
    failures.push(`Extension requests high-risk permissions: ${unexpected.join(", ")}.`);
  }

  const allowedHosts = new Set([
    "https://graph.microsoft.com/*",
    "https://login.microsoftonline.com/*",
    "https://*.microsoftpersonalcontent.com/*",
    "https://*.files.1drv.com/*",
    "https://*.1drv.com/*",
    "https://*.storage.live.com/*",
    "https://*.livefilestore.com/*",
    "https://*.svc.ms/*"
  ]);
  const unexpectedHosts = (manifest.host_permissions ?? []).filter(
    (host) => !allowedHosts.has(host)
  );
  if (unexpectedHosts.length > 0) {
    failures.push(`Extension declares unexpected host access: ${unexpectedHosts.join(", ")}.`);
  }

  const csp = manifest.content_security_policy?.extension_pages ?? "";
  for (const directive of ["script-src 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
    if (!csp.includes(directive)) failures.push(`Extension CSP is missing ${directive}.`);
  }
  if (/unsafe-(?:eval|inline)|script-src[^;]*https?:/i.test(csp)) {
    failures.push("Extension CSP permits unsafe or remote executable code.");
  }
}

function checkStaticHostHeaders() {
  const config = JSON.parse(
    readFileSync(resolve(root, "public/staticwebapp.config.json"), "utf8")
  );
  const headers = config.globalHeaders ?? {};
  const csp = headers["Content-Security-Policy"] ?? "";
  const expected = {
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };

  for (const [name, value] of Object.entries(expected)) {
    if (headers[name] !== value) failures.push(`Static host header ${name} is not hardened.`);
  }
  for (const directive of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]) {
    if (!csp.includes(directive)) failures.push(`PWA CSP is missing ${directive}.`);
  }
}

function checkLocalScripts() {
  for (const file of ["index.html", "extension/sidepanel.html"]) {
    const html = readFileSync(resolve(root, file), "utf8");
    const remoteScript = /<script\b[^>]*\bsrc=["']https?:\/\//i.test(html);
    const inlineExecutableScript = /<script\b(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html);
    if (remoteScript || inlineExecutableScript) {
      failures.push(`${file} contains remote or inline executable JavaScript.`);
    }
  }
}

function checkWorkflowActions() {
  const workflowFiles = collectFiles(resolve(root, ".github/workflows")).filter(
    (file) => [".yml", ".yaml"].includes(extname(file).toLowerCase())
  );
  for (const file of workflowFiles) {
    const workflow = readFileSync(file, "utf8");
    const references = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)].map(
      (match) => match[1]
    );
    const mutable = references.filter(
      (reference) => !reference.startsWith("./") && !/@[0-9a-f]{40}$/i.test(reference)
    );
    if (mutable.length > 0) {
      failures.push(`GitHub Actions are not pinned to full commit SHAs: ${mutable.join(", ")}.`);
    }
  }
}

function checkBuildOutput() {
  const buildFiles = ["dist", "dist-extension"]
    .flatMap((directory) => collectFiles(resolve(root, directory)))
    .filter((file) => !binaryExtensions.has(extname(file).toLowerCase()));
  if (buildFiles.length === 0) return;

  const buildText = buildFiles
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const packagePatterns = [
    ...secretPatterns,
    {
      label: "personal or machine-local information",
      pattern: /(?:\/Users\/[\w.-]+\/|\/home\/[\w.-]+\/|[A-Z]:\\Users\\)/i
    },
    {
      label: "a private/company package registry URL",
      pattern: /(?:pkgs\.visualstudio\.com\/.+\/_packaging\/|packagefeedproxy\.microsoft\.io\/npm)/i
    }
  ];
  scan("Build output", buildText, packagePatterns);
  scanEmails("Build output", buildText);
  scanPrivateTerms("Build output", buildText);
}

function collectFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function checkHistory() {
  const authorEmails = execFileSync(
    "git",
    ["log", "--all", "--format=%ae%n%ce"],
    { cwd: root, encoding: "utf8" }
  )
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const personalCommitEmail = authorEmails.some(
    (email) =>
      !email.endsWith("@users.noreply.github.com") &&
      !email.endsWith("@example.com")
  );
  if (personalCommitEmail) failures.push("Git history contains a non-noreply author email.");

  const patchHistory = execFileSync(
    "git",
    [
      "log",
      "--all",
      "--no-ext-diff",
      "--pretty=format:",
      "-p",
      "--",
      ".",
      ":(exclude)scripts/security-check.mjs"
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  scan("Git history", patchHistory, [...privacyPatterns, ...secretPatterns]);
  const historyWithoutLockfile = execFileSync(
    "git",
    [
      "log",
      "--all",
      "--no-ext-diff",
      "--pretty=format:",
      "-p",
      "--",
      ".",
      ":(exclude)pnpm-lock.yaml",
      ":(exclude)scripts/security-check.mjs"
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  scanEmails("Git history", historyWithoutLockfile);
  scanPrivateTerms("Git history", patchHistory);
}

function scanEmails(scope, content) {
  const emails = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const unexpected = emails.find(
    (email) => {
      const domain = email.toLowerCase().split("@").at(-1) ?? "";
      return (
        domain !== "example.com" &&
        !domain.endsWith(".example") &&
        domain !== "users.noreply.github.com"
      );
    }
  );
  if (unexpected) failures.push(`${scope} contain a non-placeholder email address.`);
}

function scanPrivateTerms(scope, content) {
  const terms = (process.env.RELAYDROP_PRIVATE_TERMS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (terms.some((term) => containsPrivateTerm(content, term))) {
    failures.push(`${scope} contain a configured private identifier.`);
  }
}

function containsPrivateTerm(content, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`,
    "iu"
  ).test(content);
}
