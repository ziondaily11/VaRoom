// Loads a lib/*.ts module (or a .tsx component) for node:test without a
// build step. Relative imports resolve to sibling .ts / .tsx files through
// the same loader; bare package imports, and any specifier listed, come from
// `mocks`. Browser globals are injected via `globals`. JSX compiles to
// React.createElement, so components render with react-dom/server.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function resolveFile(resolved) {
  return ['.ts', '.tsx', '', '.js'].map((extension) => resolved + extension)
    .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || resolved;
}

function loadTs(entryPath, { mocks = {}, globals = {} } = {}) {
  const cache = new Map();
  const globalNames = Object.keys(globals);
  const globalValues = globalNames.map((name) => globals[name]);

  function load(filePath) {
    if (cache.has(filePath)) return cache.get(filePath).exports;
    const source = fs.readFileSync(filePath, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React },
    }).outputText;
    const module = { exports: {} };
    cache.set(filePath, module);
    const localRequire = (specifier) => {
      if (Object.prototype.hasOwnProperty.call(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('.')) return load(resolveFile(path.resolve(path.dirname(filePath), specifier)));
      return require(specifier);
    };
    const fn = new Function('module', 'exports', 'require', ...globalNames, compiled);
    fn(module, module.exports, localRequire, ...globalValues);
    return module.exports;
  }

  return load(entryPath);
}

module.exports = { loadTs };
