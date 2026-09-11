import { readFile } from "node:fs/promises";

const manifest = await readFile(new URL("./AppxManifest.xml", import.meta.url), "utf8");

function parseXml(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("DOCTYPE and ENTITY declarations are not permitted");
  }

  const tags = [];
  let rootCount = 0;
  const tokenPattern = /<!--(?:.|[\r\n])*?-->|<\?(?:.|[\r\n])*?\?>|<(?:[^"'<>]|"[^"]*"|'[^']*')+>/g;
  let cursor = 0;
  let match;
  while ((match = tokenPattern.exec(xml)) !== null) {
    if (/\S/.test(xml.slice(cursor, match.index)) && tags.length === 0) {
      throw new Error("unexpected text outside XML elements");
    }
    cursor = tokenPattern.lastIndex;
    const token = match[0];
    if (token.startsWith("<!--") || token.startsWith("<?")) continue;
    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim();
      if (!/^[\w.:-]+$/.test(name) || tags.pop() !== name) {
        throw new Error(`mismatched closing element: ${name}`);
      }
      continue;
    }
    if (token.startsWith("<!")) throw new Error("unsupported XML declaration");
    const selfClosing = /\/\s*>$/.test(token);
    const body = token.slice(1, selfClosing ? -2 : -1).trim();
    const nameMatch = body.match(/^([\w.:-]+)/);
    if (!nameMatch) throw new Error("invalid XML element");
    const name = nameMatch[1];
    if (tags.length === 0) rootCount += 1;
    const attributes = {};
    const attributeText = body.slice(name.length);
    const attributePattern = /([\w.:-]+)\s*=\s*(["'])(.*?)\2/g;
    let attributeCursor = 0;
    let attributeMatch;
    while ((attributeMatch = attributePattern.exec(attributeText)) !== null) {
      if (/\S/.test(attributeText.slice(attributeCursor, attributeMatch.index))) {
        throw new Error(`invalid attributes on ${name}`);
      }
      attributeCursor = attributePattern.lastIndex;
      if (attributes[attributeMatch[1]] !== undefined) {
        throw new Error(`duplicate attribute on ${name}: ${attributeMatch[1]}`);
      }
      attributes[attributeMatch[1]] = attributeMatch[3];
    }
    if (/\S/.test(attributeText.slice(attributeCursor))) {
      throw new Error(`invalid attributes on ${name}`);
    }
    if (!selfClosing) tags.push(name);
    if (name === "Identity" || name === "Application") {
      const existing = tags.elements?.[name] ?? [];
      existing.push(attributes);
      if (!tags.elements) tags.elements = {};
      tags.elements[name] = existing;
    }
  }
  if (/\S/.test(xml.slice(cursor)) || tags.length !== 0 || rootCount !== 1) {
    throw new Error("malformed XML document");
  }
  return tags.elements ?? {};
}

try {
  const elements = parseXml(manifest);
  const identity = elements.Identity?.[0];
  const application = elements.Application?.[0];
  const requiredIdentity = ["Name", "Publisher", "Version"];
  const requiredApplication = ["Id", "Executable", "EntryPoint"];
  const missing = [
    ...requiredIdentity.filter((field) => !identity?.[field]).map((field) => `Identity.${field}`),
    ...requiredApplication.filter((field) => !application?.[field]).map((field) => `Application.${field}`),
  ];
  if (missing.length > 0) throw new Error(`manifest missing required fields: ${missing.join(", ")}`);
  if (identity.Publisher !== "CN=UNSIGNED-HELIX") {
    throw new Error("manifest must remain explicitly unsigned until a publisher identity is supplied");
  }
  console.log("unsigned MSIX manifest validation passed");
} catch (error) {
  console.error(`manifest validation failed: ${error.message}`);
  process.exitCode = 1;
}
