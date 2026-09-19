const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key), clear: () => data.clear() };
}
function runtime(mocks = {}, storage = memoryStorage()) {
  const root = path.resolve(__dirname, '..');
  const native = createRequire(path.join(root, 'package.json'));
  const cache = new Map();
  const listeners = {};
  const context = vm.createContext({ console, AbortController, AbortSignal, setTimeout, clearTimeout,
    crypto: webcrypto, localStorage: storage, sessionStorage: storage,
    window: { addEventListener: (name, handler) => { listeners[name] = handler; } } });
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env', '({})');
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const requireFile = specifier => {
      if (specifier in mocks) return mocks[specifier];
      if (specifier.startsWith('@/')) {
        const stem = path.join(root, 'src', specifier.slice(2));
        return load(stem + (fs.existsSync(stem + '.ts') ? '.ts' : '.tsx'));
      }
      return native(specifier);
    };
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context,
      { filename })(requireFile, module, module.exports);
    return module.exports;
  }
  return { load, storage, listeners };
}
module.exports = { runtime, memoryStorage };
