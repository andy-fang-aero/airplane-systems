/** Registration-order contract: AGENTS.md "Part order". */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const partsDir = fileURLToPath(new URL("../aircraft/sr22t/parts/", import.meta.url));

/** The barrel, `parts/index.ts`: a section importing it reaches every section. */
const BARREL = "index";

/** Every module specifier a file names: import/export declarations (incl. bare and type-only), `import()` and `require()`. */
function specifiers(fileName: string, text: string): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (ts.isStringLiteralLike(expression)) found.push(expression.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      // a non-literal argument can't be resolved statically; flag it so it can't hide a section import
      const [argument] = node.arguments;
      found.push(argument && ts.isStringLiteralLike(argument) ? argument.text : "<dynamic>");
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true));
  return found;
}

/**
 * The SR22T sections a file in `parts/` depends on, resolved against the file's own directory (or the repo root for the
 * `@/` alias) so barrels, roundabout relative paths and aliases all compare as resolved targets. Imports outside
 * `parts/` and packages are not sections. `BARREL` marks `parts/index`; "<dynamic>" a non-literal `import()`/`require()`.
 */
function sectionDependencies(fileName: string, text: string): string[] {
  return specifiers(fileName, text).flatMap((specifier) => {
    if (specifier === "<dynamic>") return [specifier];
    let target: string;
    if (specifier.startsWith(".")) target = resolve(dirname(partsDir + fileName), specifier);
    else if (specifier.startsWith("@/")) target = resolve(repoRoot, specifier.slice(2));
    else return [];
    const section = relative(partsDir, target).replace(/\.tsx?$/, "");
    if (section.startsWith("..") || section.startsWith("/")) return [];
    return [section === "" || section === BARREL ? BARREL : section.replace(/\/index$/, "")];
  });
}

const localDependencies = (file: string) => sectionDependencies(file, readFileSync(partsDir + file, "utf8"));

it("the depth section files exist and register in the epic's order", () => {
  const depthSections = [
    "engine-ignition",
    "engine-oil",
    "engine-air",
    "engine-sensors",
    "cockpit",
    "aircon",
    "controls-trim",
    "electrical-harness",
  ];
  for (const section of depthSections) expect(existsSync(partsDir + section + ".ts"), section).toBe(true);

  const requiredOrder = [
    "engine",
    "engine-ignition",
    "engine-oil",
    "engine-air",
    "engine-sensors",
    "structure",
    "cabin",
    "cockpit",
    "electrical",
    "environment",
    "aircon",
    "controls",
    "controls-trim",
    "ice",
    "oxygen",
    "electrical-harness",
  ];
  expect(localDependencies("index.ts").filter((section) => requiredOrder.includes(section))).toEqual(requiredOrder);
});

it("no SR22T section imports a section registered at or after it (AGENTS.md Part order)", () => {
  const order = localDependencies("index.ts");
  expect(order[0]).toBe("catalogue");
  expect(new Set(order).size).toBe(order.length);
  const positions = new Map(order.map((section, index) => [section, index]));
  for (const file of readdirSync(partsDir).filter((file) => file.endsWith(".ts") && file !== "index.ts")) {
    const section = file.slice(0, -3);
    const position = positions.get(section);
    expect(position, `${file} must be registered in parts/index.ts`).toBeDefined();
    for (const dependency of localDependencies(file)) {
      expect(dependency, `${file} must not import the parts/index barrel`).not.toBe(BARREL);
      expect(dependency, `${file} must import sections by a literal path`).not.toBe("<dynamic>");
      const dependencyPosition = positions.get(dependency);
      expect(dependencyPosition, `${file} imports unregistered section ${dependency}`).toBeDefined();
      expect(dependencyPosition, `${file} must register after ${dependency}.ts`).toBeLessThan(position!);
    }
  }
});

describe("the section-order scan resolves every import form", () => {
  const deps = (text: string) => sectionDependencies("engine.ts", text);
  const cases: [string, string, string[]][] = [
    ["static import", 'import { a } from "./lights";', ["lights"]],
    ["bare import", 'import "./lights";', ["lights"]],
    ["type-only import", 'import type { A } from "./lights";', ["lights"]],
    ["re-export", 'export * from "./lights";', ["lights"]],
    ["extension", 'import "./lights.ts";', ["lights"]],
    ["roundabout relative path", 'import "../../sr22t/parts/lights";', ["lights"]],
    ["alias path", 'import { a } from "@/aircraft/sr22t/parts/lights";', ["lights"]],
    ["dynamic import", 'const m = await import("./lights");', ["lights"]],
    ["require", 'const m = require("./lights");', ["lights"]],
    ["import = require", 'import m = require("./lights");', ["lights"]],
    ["non-literal dynamic import", "const m = await import(name);", ["<dynamic>"]],
    ["barrel by directory", 'import { CAT } from "../parts";', [BARREL]],
    ["barrel by dot", 'import { CAT } from ".";', [BARREL]],
    ["barrel by index", 'import { CAT } from "./index";', [BARREL]],
    ["barrel by alias", 'import { CAT } from "@/aircraft/sr22t/parts";', [BARREL]],
    ["outside parts/", 'import { FW } from "../geometry"; import { CAT } from "@/aircraft/sr20/parts";', []],
    ["package", 'import * as THREE from "three";', []],
    ["comments and strings", '// import "./lights";\nconst s = "import(\'./lights\')";', []],
  ];
  for (const [form, text, expected] of cases) it(form, () => expect(deps(text)).toEqual(expected));
});
