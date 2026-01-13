#!/usr/bin/env node
/**
 * Release helper for ioBroker adapters (idempotent)
 * - Bumps version in package.json and io-package.json
 * - Adds/updates common.news entry for the new version (multi-language skeleton)
 * - Updates README.md changelog with WORK IN PROGRESS placeholder and new version block
 * - Prevents duplicate insertion if version heading already exists
 * - Runs "npm run translate" unless --no-translate
 * - Optionally commits, tags, and publishes to npm
 *
 * Usage:
 *   node scripts/release.js 0.1.3
 *   node scripts/release.js 0.1.3 --dry
 *   node scripts/release.js 0.1.3 --no-publish
 *   node scripts/release.js 0.1.3 --no-translate
 *   node scripts/release.js 0.1.3 --message "Support multi-device config table"
 *   node scripts/release.js 0.1.3 -m "Support multi-device config table"
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function readJson(file) {
    const txt = fs.readFileSync(file, "utf8");
    return JSON.parse(txt);
}
function writeJson(file, obj) {
    const txt = `${JSON.stringify(obj, null, 2)}\n`;
    fs.writeFileSync(file, txt, "utf8");
}
function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
function log(...args) {
    console.log("[release]", ...args);
}

// ---------- args ----------
const [, , newVersion, ...rest] = process.argv;
if (!newVersion || !/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error('Usage: node scripts/release.js <x.y.z> [--dry] [--no-publish] [--no-translate] [--message "text"]');
    process.exit(1);
}
function readArgValue(flagLong, flagShort) {
    const i1 = rest.indexOf(flagLong);
    const i2 = rest.indexOf(flagShort);
    const idx = i1 >= 0 ? i1 : i2;
    if (idx >= 0 && rest[idx + 1]) {
        return rest[idx + 1];
    }
    return null;
}
const changeMsg = readArgValue("--message", "-m") || "Describe changes for this release";
const opts = {
    dry: rest.includes("--dry"),
    noPublish: rest.includes("--no-publish"),
    noTranslate: rest.includes("--no-translate"),
};

// ---------- files ----------
const pkgFile = path.join(process.cwd(), "package.json");
theIoPkgFile = path.join(process.cwd(), "io-package.json");
const readmeFile = path.join(process.cwd(), "README.md");

// ---------- load ----------
const pkg = readJson(pkgFile);
const ioPkg = readJson(theIoPkgFile);
const oldVersionPkg = pkg.version;

log(`Bumping version: ${oldVersionPkg} -> ${newVersion}`);
pkg.version = newVersion;

ioPkg.common = ioPkg.common || {};
ioPkg.common.version = newVersion;

// ---------- ensure news ----------
ioPkg.common.news = ioPkg.common.news || {};
if (!ioPkg.common.news[newVersion]) {
    ioPkg.common.news[newVersion] = {
        en: changeMsg,
    };
    log(`Added news entry for ${newVersion}`);
} else {
    // 如果提供了 message，且英语是占位，更新英文说明
    if (ioPkg.common.news[newVersion].en === "Describe changes for this release") {
        ioPkg.common.news[newVersion].en = changeMsg;
    }
}

// ---------- update README changelog ----------
let readme = "";
try {
    readme = fs.readFileSync(readmeFile, "utf8");
} catch (e) {
    console.warn("README.md not found; skipping changelog update.");
}
const dateStr = todayISO();
const changelogHeader = "## Changelog";
const workInProgressHint = `<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->`;
const newEntry = `### ${newVersion} (${dateStr})
- ${changeMsg}
`;

// 幂等：只要 README 里已含该版本标题（不考虑日期差异），就跳过插入
const versionHeadingRegex = new RegExp(`^###\\s+${newVersion.replace(/\./g, "\\.")}\\b`, "m");

if (readme) {
    if (versionHeadingRegex.test(readme)) {
        log(`README already contains an entry for ${newVersion}; skipping insertion.`);
    } else {
        // ensure Changelog header exists
        if (!readme.includes(changelogHeader)) {
            readme += `\n\n${changelogHeader}\n${workInProgressHint}\n${newEntry}\n`;
            log("Added Changelog section with WORK IN PROGRESS placeholder.");
        } else {
            // ensure WORK IN PROGRESS placeholder exists right after header
            const headerIdx = readme.indexOf(changelogHeader);
            const afterHeader = readme.slice(headerIdx + changelogHeader.length);
            if (!afterHeader.includes("WORK IN PROGRESS")) {
                readme = readme.replace(changelogHeader, `${changelogHeader}\n${workInProgressHint}`);
                log("Inserted WORK IN PROGRESS placeholder.");
            }
            // insert new entry just after placeholder
            const placeholderIdx = readme.indexOf(workInProgressHint);
            const insertPos = placeholderIdx + workInProgressHint.length;
            readme = `${readme.slice(0, insertPos)}\n${newEntry}${readme.slice(insertPos)}`;
            log(`Inserted new changelog entry: ${newVersion}`);
        }
    }
}

// ---------- write or dry-run ----------
if (opts.dry) {
    log("[DRY RUN] Would write package.json, io-package.json, README.md");
} else {
    writeJson(pkgFile, pkg);
    writeJson(theIoPkgFile, ioPkg);
    if (readme) {
        fs.writeFileSync(readmeFile, readme, "utf8");
    }
}

// ---------- translations ----------
if (!opts.noTranslate) {
    if (opts.dry) {
        log("[DRY RUN] Would run: npm run translate");
    } else {
        try {
            log("Running translations: npm run translate");
            execSync("npm run translate", { stdio: "inherit" });
        } catch (e) {
            console.warn("Translation step failed (non-blocking):", e.message);
        }
    }
} else {
    log("Skipped translation step (--no-translate)");
}

// ---------- git commit & tag ----------
try {
    if (!opts.dry) {
        // 把可能更新的 i18n 目录一起提交
        execSync("git add package.json io-package.json README.md admin/i18n || true", { stdio: "inherit" });
        execSync(`git commit -m "Release ${newVersion}"`, { stdio: "inherit" });
        execSync(`git tag v${newVersion}`, { stdio: "inherit" });
        log(`Committed and tagged v${newVersion}`);
    } else {
        log("[DRY RUN] Would git add/commit/tag");
    }
} catch (e) {
    console.warn("Git commit/tag failed (non-blocking):", e.message);
}

// ---------- npm publish ----------
if (!opts.noPublish) {
    if (opts.dry) {
        log("[DRY RUN] Would run: npm publish --access public");
    } else {
        try {
            execSync("npm publish --access public", { stdio: "inherit" });
            log("Published to npm");
        } catch (e) {
            console.error("npm publish failed:", e.message);
            process.exitCode = 2;
        }
    }
} else {
    log("Skipped npm publish (--no-publish)");
}
