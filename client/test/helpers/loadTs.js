// Loads a lib/*.ts module for node:test without a build step. Relative
// imports resolve to sibling .ts files through the same loader; bare package
// imports come from `mocks`. Browser globals are injected via `globals`.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(entryPath, { mocks = {}, globals = {} } = {}) {
  const cache = new Map();
  const globalNames = Object.keys(globals);
  const globalValues = globalNames.map((name) => globals[name]);

  function load(filePath) {
    if (cache.has(filePath)) return cache.get(filePath).exports;
    const source = fs.readFileSync(filePath, 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    cache.set(filePath, module);
    const localRequire = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filePath), specifier);
        return load(fs.existsSync(resolved + '.ts') ? resolved + '.ts' : resolved);
      }
      return require(specifier);
    };
    const fn = new Function('module', 'exports', 'require', ...globalNames, compiled);
    fn(module, module.exports, localRequire, ...globalValues);
    return module.exports;
  }

  return load(entryPath);
}

module.exports = { loadTs };
