import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const docs = join(root, "docs");
const markdownFiles = [join(root, "README.md"), ...walk(docs).filter((file) => extname(file) === ".md")];
const errors = [];

for (const file of markdownFiles) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/i.test(target)) continue;
    const path = target.split("#", 1)[0];
    if (!path) continue;
    const resolved = normalize(resolve(dirname(file), path));
    if (!resolved.startsWith(root) || !existsSync(resolved)) {
      errors.push(`${relative(file)} -> ${target}`);
    }
  }
}

const diagramDir = join(docs, "diagrams");
if (existsSync(diagramDir)) {
  for (const file of readdirSync(diagramDir).filter((name) => name.endsWith(".html"))) {
    const base = join(diagramDir, file.slice(0, -5));
    const html = readFileSync(`${base}.html`, "utf8");
    for (const extension of [".svg", ".png"]) {
      if (!existsSync(`${base}${extension}`)) errors.push(`${relative(`${base}.html`)} missing ${extension}`);
    }
    if (!/<details>\s*<summary>Mermaid source/i.test(html)) {
      errors.push(`${relative(`${base}.html`)} missing Mermaid source details`);
    }
    const markdownUsesPng = markdownFiles.some((file) =>
      readFileSync(file, "utf8").includes(`${fileName(base)}.png`),
    );
    if (!markdownUsesPng) errors.push(`${relative(`${base}.html`)} has no Markdown PNG embed`);
  }
}

if (errors.length) {
  console.error(`Documentation audit failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Documentation audit passed: ${markdownFiles.length} Markdown files and ${existsSync(diagramDir) ? readdirSync(diagramDir).filter((name) => name.endsWith(".html")).length : 0} diagrams.`);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function relative(path) {
  return path.slice(root.length + 1).replaceAll("\\", "/");
}

function fileName(path) {
  return path.slice(path.lastIndexOf("\\") + 1).slice(path.lastIndexOf("/") + 1);
}
