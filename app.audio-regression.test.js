const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('./app.js', 'utf8');

function createElement() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    appendChild() {},
    setAttribute() {},
    removeAttribute() {},
    getContext() { return { clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, closePath() {} }; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    value: '',
    textContent: '',
    disabled: false,
    click() {},
    focus() {},
    blur() {},
    submit() {},
  };
}

const context = {
  console,
  document: {
    getElementById(id) {
      const element = createElement();
      if (id === 'trackList') element.innerHTML = '';
      return element;
    },
    querySelectorAll() { return []; },
    createElement() { return createElement(); },
    addEventListener() {},
    body: createElement(),
  },
  window: {
    addEventListener() {},
    location: { search: '', pathname: '/' },
    history: { replaceState() {} },
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  },
  URL: {
    createObjectURL() { return 'blob:mock'; },
    revokeObjectURL() {},
  },
  Blob: class {},
  FileReader: class {},
  AudioContext: class {},
  OfflineAudioContext: class {},
  navigator: { userAgent: 'node' },
  setInterval() {},
  clearInterval() {},
  clearTimeout() {},
  setTimeout() {},
};
context.window.window = context.window;
context.window.document = context.document;
context.document.defaultView = context.window;

vm.createContext(context);
vm.runInContext(code, context);

const neutralStem = {
  denoiser: 0,
  low: 0,
  saturation: 0,
  tubeDrive: 0,
  reverb: 0,
  hpf: 20,
  lowMid: 0,
  mid: 0,
  presence: 0,
  lpf: 20000,
  hasAppliedProcessing: false,
};

assert.strictEqual(context.shouldUseEffectChain(neutralStem), false, 'Neutral stems should bypass the effect chain');
assert.strictEqual(context.shouldUseEffectChain({ ...neutralStem, low: 2 }), true, 'Changed stems should activate the effect chain');
assert.strictEqual(context.shouldUseMasteringChain('balanced', 0, -24, 2), false, 'Mastering should stay bypassed until a preset or control is applied');
assert.strictEqual(context.shouldUseMasteringChain('streaming', -6, -18, 2.5), true, 'Mastering should activate once a preset or control is applied');

const identityCurve = context.makeTubeDistortion(0);
assert.ok(Math.abs(identityCurve[0] + 1) < 1e-6, 'Zero-drive tube distortion should remain identity at the first sample');
assert.ok(Math.abs(identityCurve[identityCurve.length - 1] - 1) < 1e-4, 'Zero-drive tube distortion should remain identity at the last sample');

console.log('Audio regression checks passed.');
