const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const playButton = document.getElementById('playButton');
const stopButton = document.getElementById('stopButton');
const exportButton = document.getElementById('exportButton');
const trackList = document.getElementById('trackList');
const masterGainControl = document.getElementById('masterGain');
const masterGainValue = document.getElementById('masterGainValue');
const thresholdControl = document.getElementById('threshold');
const thresholdValue = document.getElementById('thresholdValue');
const ratioControl = document.getElementById('ratio');
const ratioValue = document.getElementById('ratioValue');
const detectedKeyElement = document.getElementById('detectedKey');
const detectedTempoElement = document.getElementById('detectedTempo');
const meterFill = document.getElementById('meterFill');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userDisplay = document.getElementById('userDisplay');
const userName = document.getElementById('userName');
const loginModal = document.getElementById('loginModal');
const paymentModal = document.getElementById('paymentModal');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const demoLoginBtn = document.getElementById('demoLoginBtn');
const submitPaymentBtn = document.getElementById('submit-payment');
const stereoWidthControl = document.getElementById('stereoWidth');
const stereoWidthValue = document.getElementById('stereoWidthValue');
const autoLevelingToggle = document.getElementById('autoLevelingToggle');
const masteringPresetSelect = document.getElementById('masteringPresetSelect');
const applyPresetBtn = document.getElementById('applyPresetBtn');
const applyAssistantPresetBtn = document.getElementById('applyAssistantPreset');
const mixAssistantMessage = document.getElementById('mixAssistantMessage');
const saveSnapshotBtn = document.getElementById('saveSnapshotBtn');
const snapshotSelect = document.getElementById('snapshotSelect');
const restoreSnapshotBtn = document.getElementById('restoreSnapshotBtn');
const compareModeBtn = document.getElementById('compareModeBtn');
const heroUploadBtn = document.getElementById('heroUploadBtn');
const masteringContent = document.getElementById('masteringContent');
const masteringPlaceholder = document.getElementById('masteringPlaceholder');
const mixStateBadge = document.getElementById('mixStateBadge');

let audioContext;
let stems = [];
let masterGainNode;
let compressorNode;
let analyserNode;
let isPlaying = false;
let currentUser = null;
let stripe = null;
let cardElement = null;
let stereoWidth = 20;
let autoLevelingEnabled = false;
let compareModeEnabled = false;
let snapshots = [];
let currentPresetName = 'balanced';

// Initialize Stripe
function initStripe() {
  if (!window.Stripe) {
    console.error('Stripe failed to load. Payment features disabled.');
    return;
  }

  try {
    stripe = window.Stripe('pk_test_TYoo1fQ0fQ0fQ0fQ0fQ0fQ0fQ0fQ0fQ0fQ0fQ0fQ0fQ0fQ0fQ0');
    const elements = stripe.elements();
    cardElement = elements.create('card');
    cardElement.mount('#card-element');
    cardElement.addEventListener('change', (e) => {
      const displayError = document.getElementById('card-errors');
      if (e.error) {
        displayError.textContent = e.error.message;
      } else {
        displayError.textContent = '';
      }
    });
  } catch (error) {
    console.error('Stripe could not be initialized:', error);
    stripe = null;
  }
}

// Check if user is logged in on page load
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const userStr = params.get('user');
  
  if (token && userStr) {
    currentUser = JSON.parse(decodeURIComponent(userStr));
    localStorage.setItem('authToken', token);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateAuthUI();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
  const savedUser = localStorage.getItem('currentUser');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    updateAuthUI();
  }
  
  loadSnapshots();
  initStripe();
  ensureAudioContext();
  const preset = getPresetConfig('balanced');
  currentPresetName = 'balanced';
  masterGainControl.value = preset.masterGain;
  thresholdControl.value = preset.threshold;
  ratioControl.value = preset.ratio;
  stereoWidth = preset.stereoWidth;
  autoLevelingEnabled = false;
  if (masteringPresetSelect) masteringPresetSelect.value = 'balanced';
  updateMasteringControls();
  updateMixAssistant();
  toggleMasteringVisibility();
});

function updateAuthUI() {
  if (currentUser) {
    loginBtn.style.display = 'none';
    userDisplay.style.display = 'inline-flex';
    userName.textContent = `Welcome, ${currentUser.displayName}!`;
  } else {
    loginBtn.style.display = 'inline-block';
    userDisplay.style.display = 'none';
  }
}

function toggleMasteringVisibility() {
  if (!masteringContent || !masteringPlaceholder) return;
  if (stems.length > 0) {
    masteringContent.classList.remove('hidden');
    masteringPlaceholder.classList.add('hidden');
  } else {
    masteringContent.classList.add('hidden');
    masteringPlaceholder.classList.remove('hidden');
  }
}

function updateMixStateBadge() {
  if (!mixStateBadge) return;
  const hasAppliedChanges = stems.some((stem) => stem.hasAppliedProcessing);
  if (compareModeEnabled) {
    mixStateBadge.textContent = 'Compare mode active';
  } else {
    mixStateBadge.textContent = hasAppliedChanges ? 'Processing active' : 'Raw preview';
  }
  mixStateBadge.classList.toggle('active', hasAppliedChanges || compareModeEnabled);
}

function updateCompareModeUI() {
  if (!compareModeBtn) return;
  compareModeBtn.textContent = compareModeEnabled ? 'Dry Compare: On' : 'Dry Compare: Off';
  compareModeBtn.classList.toggle('active', compareModeEnabled);
}

function setCompareMode(enabled) {
  compareModeEnabled = enabled;
  updateCompareModeUI();
  stems.forEach((_, index) => applyStemEffectsToAudioNodes(index));
  updateMasteringControls();
  updateMixStateBadge();
}

// Login/Logout handlers
loginBtn.addEventListener('click', () => {
  loginModal.style.display = 'block';
});

logoutBtn.addEventListener('click', () => {
  stopPlayback();
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  currentUser = null;
  updateAuthUI();
  stems = [];
  renderTracks();
});

googleLoginBtn?.addEventListener('click', () => {
  alert('Google login is not available in this public preview. Please use the Demo Account to explore the app.');
});

demoLoginBtn.addEventListener('click', () => {
  currentUser = {
    id: 'demo',
    displayName: 'Demo User',
    email: 'demo@example.com',
    provider: 'demo'
  };
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  updateAuthUI();
  loginModal.style.display = 'none';
});

// Modal close buttons
document.querySelectorAll('.close').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.target.closest('.modal').style.display = 'none';
  });
});

window.addEventListener('click', (e) => {
  if (e.target === loginModal) loginModal.style.display = 'none';
  if (e.target === paymentModal) paymentModal.style.display = 'none';
});

function makeTubeDistortion(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  if (amount <= 0) {
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = x;
    }
    return curve;
  }

  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function makeSaturation(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Soft saturation using tanh-like curve
    // amount is a percentage 0-100
    const drive = 1 + amount * 0.1;
    const saturated = Math.tanh(x * drive);
    // Blend between dry and saturated based on amount
    curve[i] = x + (saturated - x) * (amount / 100);
  }
  return curve;
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGainNode = audioContext.createGain();
    compressorNode = audioContext.createDynamicsCompressor();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    masterGainNode.connect(compressorNode);
    compressorNode.connect(analyserNode);
    analyserNode.connect(audioContext.destination);
  }
}

function formatDb(value) {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
}

// Key Detection - Fast FFT-based pitch detection
async function detectKey(audioBuffer) {
  // Only analyze first 5 seconds for speed
  const sampleRate = audioBuffer.sampleRate;
  const maxSamples = Math.min(audioBuffer.length, sampleRate * 5);
  const channelData = audioBuffer.getChannelData(0).slice(0, maxSamples);
  
  // Find dominant frequency using simple FFT-like approach
  const fftSize = 4096;
  let maxEnergy = 0;
  let dominantFreq = 0;
  
  // Divide into windows and find dominant frequency in each
  const windows = Math.min(Math.floor(channelData.length / fftSize), 100);
  const freqAccumulator = new Array(128).fill(0);
  
  for (let w = 0; w < windows; w++) {
    const windowStart = w * fftSize;
    const window = channelData.slice(windowStart, windowStart + fftSize);
    
    // Simple zero-crossing rate and energy to estimate pitch range
    let zeroCrossings = 0;
    let energy = 0;
    for (let i = 0; i < window.length; i++) {
      energy += window[i] * window[i];
      if (i > 0 && window[i] * window[i - 1] < 0) {
        zeroCrossings++;
      }
    }
    
    // Estimate frequency from zero-crossing rate
    const zcFreq = (zeroCrossings * sampleRate) / (2 * fftSize);
    if (zcFreq > 50 && zcFreq < 2000 && energy > maxEnergy * 0.1) {
      const binIndex = Math.floor(zcFreq / 100) % 128;
      freqAccumulator[binIndex] += energy;
      if (energy > maxEnergy) {
        maxEnergy = energy;
        dominantFreq = zcFreq;
      }
    }
  }
  
  // Map frequency to musical note
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const A4 = 440;
  
  if (dominantFreq > 50 && dominantFreq < 2000) {
    const halfSteps = 12 * Math.log2(dominantFreq / A4);
    const noteIndex = Math.round(halfSteps + 57) % 12;
    const octave = Math.floor((Math.round(halfSteps + 57) + 12) / 12);
    
    if (noteIndex >= 0 && noteIndex < 12) {
      return `${notes[noteIndex]}${Math.max(2, Math.min(8, octave))}`;
    }
  }
  
  return 'N/A';
}

// Tempo Detection - Fast and reliable BPM detection
async function detectTempo(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  
  // Only analyze first 30 seconds for speed
  const analyzeLength = Math.min(channelData.length, sampleRate * 30);
  const channel = channelData.slice(0, analyzeLength);
  
  // Apply high-pass filter to remove low-frequency rumble
  const filtered = new Float32Array(channel.length);
  let prev = 0;
  const alpha = 0.95; // High-pass filter coefficient
  
  for (let i = 0; i < channel.length; i++) {
    filtered[i] = alpha * (prev + channel[i] - (i > 0 ? channel[i - 1] : 0));
    prev = filtered[i];
  }
  
  // Detect onset frames using spectral flux
  const hopSize = 512;
  const frameCount = Math.floor(channel.length / hopSize);
  const onsetStrength = new Float32Array(frameCount);
  
  for (let frameIdx = 0; frameIdx < frameCount; frameIdx++) {
    let energy = 0;
    const frameStart = frameIdx * hopSize;
    const frameEnd = Math.min(frameStart + hopSize, filtered.length);
    
    for (let i = frameStart; i < frameEnd; i++) {
      energy += filtered[i] * filtered[i];
    }
    onsetStrength[frameIdx] = Math.sqrt(energy);
  }
  
  // Find peaks in onset strength
  const peaks = [];
  const avgStrength = onsetStrength.reduce((a, b) => a + b) / frameCount;
  const threshold = avgStrength * 0.5;
  
  for (let i = 2; i < frameCount - 2; i++) {
    if (onsetStrength[i] > threshold) {
      // Check if local maximum
      if (onsetStrength[i] > onsetStrength[i-1] && 
          onsetStrength[i] > onsetStrength[i-2] &&
          onsetStrength[i] >= onsetStrength[i+1] && 
          onsetStrength[i] >= onsetStrength[i+2]) {
        peaks.push(i);
      }
    }
  }
  
  if (peaks.length < 4) {
    return 0;
  }
  
  // Calculate inter-onset intervals
  const intervals = [];
  for (let i = 1; i < Math.min(peaks.length, 30); i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }
  
  // Find the most common interval
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];
  
  // Convert frame interval to BPM
  const frameDuration = hopSize / sampleRate;
  const beatDuration = medianInterval * frameDuration;
  let bpm = Math.round(60 / beatDuration);
  
  // Handle half/double tempo issues
  if (bpm < 80) {
    bpm *= 2;
  } else if (bpm > 160) {
    bpm = Math.round(bpm / 2);
  }
  
  // Validate BPM range
  if (bpm >= 60 && bpm <= 200) {
    return bpm;
  }
  
  return 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shouldUseEffectChain(stem) {
  if (compareModeEnabled) return false;
  return Boolean(
    stem?.hasAppliedProcessing ||
    stem?.denoiser > 0 ||
    stem?.low !== 0 ||
    stem?.saturation > 0 ||
    stem?.tubeDrive > 0 ||
    stem?.reverb > 0 ||
    stem?.hpf !== 20 ||
    stem?.lowMid !== 0 ||
    stem?.mid !== 0 ||
    stem?.presence !== 0 ||
    stem?.lpf !== 20000
  );
}

function isNeutralStem(stem) {
  return !shouldUseEffectChain(stem);
}

function shouldUseMasteringChain(presetName = currentPresetName, gain = Number(masterGainControl.value), threshold = Number(thresholdControl.value), ratio = Number(ratioControl.value)) {
  if (compareModeEnabled) return false;
  const normalizedGain = Number(gain);
  const normalizedThreshold = Number(threshold);
  const normalizedRatio = Number(ratio);
  const presetChanged = presetName === true || presetName === false ? presetName : presetName !== 'balanced';
  return Boolean(
    presetChanged ||
    Math.abs(normalizedGain) > 1e-6 ||
    Math.abs(normalizedThreshold + 24) > 1e-6 ||
    Math.abs(normalizedRatio - 2) > 1e-6
  );
}

function updateMasteringControls() {
  const gain = Number(masterGainControl.value);
  const threshold = Number(thresholdControl.value);
  const ratio = Number(ratioControl.value);
  const useMastering = shouldUseMasteringChain(currentPresetName, gain, threshold, ratio);
  if (masterGainNode) masterGainNode.gain.value = useMastering ? Math.pow(10, gain / 20) : 1;
  if (compressorNode) {
    compressorNode.threshold.value = useMastering ? threshold : -100;
    compressorNode.ratio.value = useMastering ? ratio : 1;
    compressorNode.attack.value = useMastering ? 0.005 : 0.001;
    compressorNode.release.value = useMastering ? 0.1 : 0.001;
  }
  masterGainValue.textContent = formatDb(gain);
  thresholdValue.textContent = `${threshold} dB`;
  ratioValue.textContent = `${ratio.toFixed(1)}:1`;
  if (stereoWidthValue) stereoWidthValue.textContent = `${Math.round(stereoWidth)}%`;
  if (stereoWidthControl) stereoWidthControl.value = stereoWidth;
  if (autoLevelingToggle) autoLevelingToggle.checked = autoLevelingEnabled;
  updateMixAssistant();
}

function getPresetConfig(presetName) {
  const presets = {
    balanced: { masterGain: 0, threshold: -24, ratio: 2, stereoWidth: 20, autoLeveling: true },
    radio: { masterGain: 1.5, threshold: -18, ratio: 2.5, stereoWidth: 28, autoLeveling: true },
    streaming: { masterGain: 1.2, threshold: -16, ratio: 3, stereoWidth: 32, autoLeveling: true },
    podcast: { masterGain: -1.5, threshold: -30, ratio: 1.8, stereoWidth: 12, autoLeveling: false },
    club: { masterGain: 2.0, threshold: -12, ratio: 4.5, stereoWidth: 35, autoLeveling: true }
  };
  return presets[presetName] || presets.balanced;
}

function applyMasteringPreset(presetName) {
  const preset = getPresetConfig(presetName);
  currentPresetName = presetName;
  masterGainControl.value = preset.masterGain;
  thresholdControl.value = preset.threshold;
  ratioControl.value = preset.ratio;
  stereoWidth = preset.stereoWidth;
  autoLevelingEnabled = preset.autoLeveling;
  if (masteringPresetSelect) masteringPresetSelect.value = presetName;
  updateMasteringControls();
  applyAutoLeveling();
}

function updateMixAssistant() {
  if (!mixAssistantMessage) return;
  if (compareModeEnabled) {
    mixAssistantMessage.textContent = 'Dry compare is active. Toggle it off to hear the premium processing chain again.';
    if (applyAssistantPresetBtn) applyAssistantPresetBtn.dataset.preset = 'balanced';
    return;
  }
  const stemCount = stems.length;
  const tempoText = detectedTempoElement.textContent || '';
  const tempoValue = Number(tempoText.replace(/\D/g, ''));
  const hasKey = detectedKeyElement.textContent && detectedKeyElement.textContent !== '—' && detectedKeyElement.textContent !== 'Analyzing...';

  if (stemCount >= 4) {
    mixAssistantMessage.textContent = 'Your session has several stems; the streaming preset will keep the mix punchy and wide.';
    if (applyAssistantPresetBtn) applyAssistantPresetBtn.dataset.preset = 'streaming';
  } else if (stemCount <= 2) {
    mixAssistantMessage.textContent = 'With fewer stems, the podcast preset keeps vocals clear and controlled.';
    if (applyAssistantPresetBtn) applyAssistantPresetBtn.dataset.preset = 'podcast';
  } else if (tempoValue >= 120) {
    mixAssistantMessage.textContent = 'A faster tempo benefits from a club-ready preset with more punch.';
    if (applyAssistantPresetBtn) applyAssistantPresetBtn.dataset.preset = 'club';
  } else if (hasKey) {
    mixAssistantMessage.textContent = 'Your detected key suggests a balanced warm preset will sound cohesive.';
    if (applyAssistantPresetBtn) applyAssistantPresetBtn.dataset.preset = 'balanced';
  } else {
    mixAssistantMessage.textContent = 'Balanced mastering for a clean, release-ready mix.';
    if (applyAssistantPresetBtn) applyAssistantPresetBtn.dataset.preset = 'balanced';
  }
}

function getEffectiveStemGain(stem) {
  const baseGain = stem.gain + (autoLevelingEnabled ? (stem.autoGain || 0) : 0);
  return Math.pow(10, baseGain / 20);
}

function getStemRms(stem) {
  if (!stem?.buffer) return 0.15;
  const channelData = stem.buffer.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < channelData.length; i += 1) {
    sum += channelData[i] * channelData[i];
  }
  return Math.sqrt(sum / channelData.length);
}

function applyAutoLeveling() {
  if (!stems.length) return;
  if (!autoLevelingEnabled) {
    stems.forEach((stem) => {
      stem.autoGain = 0;
    });
    return;
  }

  stems.forEach((stem) => {
    const rms = getStemRms(stem);
    const targetRms = 0.16;
    const gainLinear = rms > 0 ? targetRms / rms : 1;
    const gainDb = 20 * Math.log10(clamp(gainLinear, 0.25, 4));
    stem.autoGain = clamp(gainDb, -12, 6);
  });
}

function saveSnapshot() {
  const snapshotName = `Snapshot ${snapshots.length + 1}`;
  snapshots.push({
    name: snapshotName,
    masterGain: Number(masterGainControl.value),
    threshold: Number(thresholdControl.value),
    ratio: Number(ratioControl.value),
    stereoWidth,
    autoLevelingEnabled,
    compareModeEnabled,
    currentPresetName,
    stems: stems.map((stem) => ({
      name: stem.name,
      gain: stem.gain,
      pan: stem.pan,
      muted: stem.muted,
      solo: stem.solo,
      denoiser: stem.denoiser,
      low: stem.low,
      saturation: stem.saturation,
      tubeDrive: stem.tubeDrive,
      reverb: stem.reverb,
      hpf: stem.hpf,
      lowMid: stem.lowMid,
      mid: stem.mid,
      presence: stem.presence,
      lpf: stem.lpf,
      autoGain: stem.autoGain || 0
    }))
  });
  persistSnapshots();
  renderSnapshots();
}

function persistSnapshots() {
  localStorage.setItem('musicBoostSnapshots', JSON.stringify(snapshots));
}

function loadSnapshots() {
  try {
    const stored = localStorage.getItem('musicBoostSnapshots');
    if (stored) {
      snapshots = JSON.parse(stored);
      renderSnapshots();
    }
  } catch (error) {
    console.warn('Could not load snapshots', error);
  }
}

function renderSnapshots() {
  if (!snapshotSelect) return;
  snapshotSelect.innerHTML = '<option value="">No snapshot</option>';
  snapshots.forEach((snapshot, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = snapshot.name;
    snapshotSelect.appendChild(option);
  });
}

function restoreSnapshot() {
  if (!snapshotSelect || snapshotSelect.value === '') return;
  const snapshot = snapshots[Number(snapshotSelect.value)];
  if (!snapshot) return;
  masterGainControl.value = snapshot.masterGain;
  thresholdControl.value = snapshot.threshold;
  ratioControl.value = snapshot.ratio;
  stereoWidth = snapshot.stereoWidth;
  autoLevelingEnabled = snapshot.autoLevelingEnabled;
  compareModeEnabled = Boolean(snapshot.compareModeEnabled);
  currentPresetName = snapshot.currentPresetName || 'balanced';
  stems.forEach((stem, index) => {
    const snapshotStem = snapshot.stems[index];
    if (!snapshotStem) return;
    stem.gain = snapshotStem.gain;
    stem.pan = snapshotStem.pan;
    stem.muted = snapshotStem.muted;
    stem.solo = snapshotStem.solo;
    stem.denoiser = snapshotStem.denoiser;
    stem.low = snapshotStem.low;
    stem.saturation = snapshotStem.saturation;
    stem.tubeDrive = snapshotStem.tubeDrive;
    stem.reverb = snapshotStem.reverb;
    stem.hpf = snapshotStem.hpf;
    stem.lowMid = snapshotStem.lowMid;
    stem.mid = snapshotStem.mid;
    stem.presence = snapshotStem.presence;
    stem.lpf = snapshotStem.lpf;
    stem.autoGain = snapshotStem.autoGain || 0;
  });
  updateCompareModeUI();
  renderTracks();
  updateMasteringControls();
  applyAutoLeveling();
  updateMixStateBadge();
}

function updateMeter() {
  if (!isPlaying) {
    meterFill.style.width = '0%';
    return;
  }
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteTimeDomainData(dataArray);
  let peak = 0;
  for (const sample of dataArray) {
    const normalized = Math.abs(sample - 128) / 128;
    peak = Math.max(peak, normalized);
  }
  meterFill.style.width = `${Math.min(100, peak * 120)}%`;
  requestAnimationFrame(updateMeter);
}

function applyStemEffectsToAudioNodes(trackIndex) {
  const stem = stems[trackIndex];
  if (!stem?.gainNode) return;

  stem.gainNode.gain.value = stem.muted ? 0 : getEffectiveStemGain(stem);

  const useEffectChain = shouldUseEffectChain(stem);

  if (stem.panNode) {
    const effectivePan = clamp(stem.pan * (1 + stereoWidth / 100), -1, 1);
    stem.panNode.pan.value = effectivePan;
  }

  if (stem.denoiserNode) {
    stem.denoiserNode.threshold.value = useEffectChain ? -60 + (100 - stem.denoiser) * 0.6 : -100;
  }
  if (stem.lowNode) {
    stem.lowNode.gain.value = useEffectChain ? stem.low : 0;
  }
  if (stem.saturationNode) {
    stem.saturationNode.curve = useEffectChain ? makeSaturation(stem.saturation) : makeSaturation(0);
  }
  if (stem.tubeNode) {
    stem.tubeNode.curve = useEffectChain ? makeTubeDistortion(stem.tubeDrive / 10) : makeTubeDistortion(0);
  }
  if (stem.dryNode && stem.wetNode && stem.reverbDelay) {
    stem.dryNode.gain.value = useEffectChain ? 1 - (stem.reverb / 100) * 0.8 : 1;
    stem.wetNode.gain.value = useEffectChain ? (stem.reverb / 100) * 0.5 : 0;
    stem.reverbDelay.delayTime.value = useEffectChain ? 0.3 + (stem.reverb / 100) * 0.4 : 0.3;
  }
  if (stem.hpfNode) {
    stem.hpfNode.frequency.value = useEffectChain ? stem.hpf : 20;
  }
  if (stem.lowMidNode) {
    stem.lowMidNode.gain.value = useEffectChain ? stem.lowMid : 0;
  }
  if (stem.midNode) {
    stem.midNode.gain.value = useEffectChain ? stem.mid : 0;
  }
  if (stem.presenceNode) {
    stem.presenceNode.gain.value = useEffectChain ? stem.presence : 0;
  }
  if (stem.lpfNode) {
    stem.lpfNode.frequency.value = useEffectChain ? stem.lpf : 20000;
  }
}

function applyEffectPreset(trackIndex, presetName) {
  const presets = {
    clean: {
      denoiser: 20,
      low: 1,
      saturation: 15,
      tubeDrive: 10,
      reverb: 5,
      hpf: 20,
      lowMid: 2,
      mid: 1,
      presence: 2,
      lpf: 20000
    },
    warm: {
      denoiser: 25,
      low: 3,
      saturation: 25,
      tubeDrive: 30,
      reverb: 15,
      hpf: 25,
      lowMid: 4,
      mid: 1,
      presence: 1,
      lpf: 18000
    },
    bright: {
      denoiser: 10,
      low: 0,
      saturation: 10,
      tubeDrive: 10,
      reverb: 5,
      hpf: 25,
      lowMid: 0,
      mid: 3,
      presence: 4,
      lpf: 20000
    },
    vintage: {
      denoiser: 35,
      low: 2,
      saturation: 35,
      tubeDrive: 45,
      reverb: 25,
      hpf: 35,
      lowMid: 3,
      mid: -1,
      presence: 0,
      lpf: 16000
    },
    dense: {
      denoiser: 20,
      low: 4,
      saturation: 30,
      tubeDrive: 25,
      reverb: 35,
      hpf: 20,
      lowMid: 2,
      mid: 2,
      presence: 2,
      lpf: 18000
    }
  };

  const selected = presets[presetName];
  if (!selected) return;

  Object.entries(selected).forEach(([control, value]) => {
    stems[trackIndex][control] = value;
  });

  stems[trackIndex].hasAppliedProcessing = true;
  applyStemEffectsToAudioNodes(trackIndex);
  renderTracks();
  updateMixStateBadge();
}

function createTrackCard(stem, index) {
  const card = document.createElement('article');
  card.className = 'track-card';
  const effectMode = stem.effectMode || 'manual';
  const isBypassed = isNeutralStem(stem);
  const effectControlsHtml = effectMode === 'quick' ? `
    <div class="effect-preset-grid">
      <button type="button" class="effect-preset-btn" data-track="${index}" data-preset="clean">Clean</button>
      <button type="button" class="effect-preset-btn" data-track="${index}" data-preset="warm">Warm</button>
      <button type="button" class="effect-preset-btn" data-track="${index}" data-preset="bright">Bright</button>
      <button type="button" class="effect-preset-btn" data-track="${index}" data-preset="vintage">Vintage</button>
      <button type="button" class="effect-preset-btn" data-track="${index}" data-preset="dense">Dense</button>
    </div>
    <p class="effect-help">Pick a quick flavor profile or switch back to manual sliders for detailed sculpting.</p>
  ` : `
    <div class="effect-section">
      <label>Denoiser <span class="value">${stem.denoiser}%</span>
        <input type="range" min="0" max="100" step="1" value="${stem.denoiser}" data-track="${index}" data-control="denoiser">
      </label>
    </div>

    <div class="effect-section">
      <label>Low <span class="value">${stem.low >= 0 ? '+' : ''}${stem.low.toFixed(1)} dB</span>
        <input type="range" min="-12" max="12" step="0.5" value="${stem.low}" data-track="${index}" data-control="low">
      </label>
    </div>

    <div class="effect-section">
      <label>Saturation <span class="value">${stem.saturation}%</span>
        <input type="range" min="0" max="100" step="1" value="${stem.saturation}" data-track="${index}" data-control="saturation">
      </label>
    </div>

    <div class="effect-section">
      <label>Tube Drive <span class="value">${stem.tubeDrive}%</span>
        <input type="range" min="0" max="100" step="1" value="${stem.tubeDrive}" data-track="${index}" data-control="tubeDrive">
      </label>
    </div>

    <div class="effect-section">
      <label>Reverb <span class="value">${stem.reverb}%</span>
        <input type="range" min="0" max="100" step="1" value="${stem.reverb}" data-track="${index}" data-control="reverb">
      </label>
    </div>

    <div class="effect-section">
      <label>HPF <span class="value">${stem.hpf} Hz</span>
        <input type="range" min="20" max="500" step="10" value="${stem.hpf}" data-track="${index}" data-control="hpf">
      </label>
    </div>

    <div class="effect-section">
      <label>Low Mid <span class="value">${stem.lowMid >= 0 ? '+' : ''}${stem.lowMid.toFixed(1)} dB</span>
        <input type="range" min="-12" max="12" step="0.5" value="${stem.lowMid}" data-track="${index}" data-control="lowMid">
      </label>
    </div>

    <div class="effect-section">
      <label>Mid <span class="value">${stem.mid >= 0 ? '+' : ''}${stem.mid.toFixed(1)} dB</span>
        <input type="range" min="-12" max="12" step="0.5" value="${stem.mid}" data-track="${index}" data-control="mid">
      </label>
    </div>

    <div class="effect-section">
      <label>Presence <span class="value">${stem.presence >= 0 ? '+' : ''}${stem.presence.toFixed(1)} dB</span>
        <input type="range" min="-12" max="12" step="0.5" value="${stem.presence}" data-track="${index}" data-control="presence">
      </label>
    </div>

    <div class="effect-section">
      <label>LPF <span class="value">${stem.lpf} Hz</span>
        <input type="range" min="2000" max="20000" step="100" value="${stem.lpf}" data-track="${index}" data-control="lpf">
      </label>
    </div>
  `;

  card.innerHTML = `
    <div class="track-header">
      <h3>${stem.name}</h3>
      ${isBypassed ? '<span class="track-badge">Bypassed</span>' : ''}
    </div>
    <div class="track-controls">
      <label>Gain <span class="value">${stem.gain.toFixed(1)} dB</span>
        <input type="range" min="-24" max="12" step="0.5" value="${stem.gain}" data-track="${index}" data-control="gain">
      </label>
      <label>Pan <span class="value">${stem.pan.toFixed(1)}</span>
        <input type="range" min="-1" max="1" step="0.05" value="${stem.pan}" data-track="${index}" data-control="pan">
      </label>
      
      <div class="track-actions">
        <button type="button" data-track="${index}" data-action="mute">${stem.muted ? 'Unmute' : 'Mute'}</button>
        <button type="button" data-track="${index}" data-action="solo">${stem.solo ? 'Unsolo' : 'Solo'}</button>
      </div>

      <div class="track-effects">
        <div class="effect-mode-switch">
          <span class="mode-label">Effect mode</span>
          <div class="mode-buttons">
            <button type="button" class="mode-btn ${effectMode === 'manual' ? 'active' : ''}" data-track="${index}" data-mode="manual">Manual</button>
            <button type="button" class="mode-btn ${effectMode === 'quick' ? 'active' : ''}" data-track="${index}" data-mode="quick">Quick</button>
          </div>
        </div>
        <details open>
          <summary>Effects</summary>
          ${effectControlsHtml}
        </details>
      </div>
    </div>
  `;

  card.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const trackIndex = Number(event.target.dataset.track);
      const control = event.target.dataset.control;
      const value = Number(event.target.value);
      stems[trackIndex][control] = value;
      stems[trackIndex].hasAppliedProcessing = true;
      
      const valueSpan = event.target.parentElement.querySelector('.value');
      if (valueSpan) {
        if (control === 'gain') {
          valueSpan.textContent = formatDb(value);
        } else if (control === 'pan') {
          valueSpan.textContent = value.toFixed(1);
        } else if (control === 'hpf' || control === 'lpf') {
          valueSpan.textContent = `${value} Hz`;
        } else if (control === 'tubeDrive' || control === 'reverb' || control === 'denoiser' || control === 'saturation') {
          valueSpan.textContent = `${value}%`;
        } else {
          valueSpan.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`;
        }
      }

      applyStemEffectsToAudioNodes(trackIndex);
      updateMixStateBadge();
    });
  });

  card.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const trackIndex = Number(button.dataset.track);
      stems[trackIndex].effectMode = button.dataset.mode;
      renderTracks();
    });
  });

  card.querySelectorAll('.effect-preset-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const trackIndex = Number(button.dataset.track);
      applyEffectPreset(trackIndex, button.dataset.preset);
    });
  });

  card.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const trackIndex = Number(button.dataset.track);
      const action = button.dataset.action;
      if (action === 'mute') {
        stems[trackIndex].muted = !stems[trackIndex].muted;
        applyStemEffectsToAudioNodes(trackIndex);
        button.textContent = stems[trackIndex].muted ? 'Unmute' : 'Mute';
      }
      if (action === 'solo') {
        stems[trackIndex].solo = !stems[trackIndex].solo;
        updateSoloStates();
        button.textContent = stems[trackIndex].solo ? 'Unsolo' : 'Solo';
      }
    });
  });

  return card;
}

function updateSoloStates() {
  const anySolo = stems.some((stem) => stem.solo);
  stems.forEach((stem) => {
    const shouldBeMuted = anySolo ? !stem.solo : stem.muted;
    if (stem.gainNode) {
      stem.gainNode.gain.value = shouldBeMuted ? 0 : getEffectiveStemGain(stem);
    }
  });
  renderTracks();
}

function renderTracks() {
  trackList.innerHTML = '';
  if (!stems.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No stems loaded yet.';
    trackList.appendChild(empty);
    exportButton.disabled = true;
    detectedKeyElement.textContent = '—';
    detectedTempoElement.textContent = '—';
    toggleMasteringVisibility();
    return;
  }

  stems.forEach((stem, index) => trackList.appendChild(createTrackCard(stem, index)));
  exportButton.disabled = false;
  toggleMasteringVisibility();
}

async function createStemNodes(track) {
  const source = audioContext.createBufferSource();
  source.buffer = track.buffer;
  const gainNode = audioContext.createGain();
  const panNode = audioContext.createStereoPanner();
  source.connect(gainNode);
  gainNode.connect(panNode);
  panNode.connect(masterGainNode);
  gainNode.gain.value = Math.pow(10, track.gain / 20);
  panNode.pan.value = track.pan;
  return { source, gainNode, panNode };
}

async function loadFiles(files) {
  ensureAudioContext();
  const fileArray = Array.from(files);

  const loadedStems = await Promise.all(fileArray.map(async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audioContext.decodeAudioData(arrayBuffer);

    return {
      name: file.name,
      file,
      buffer,
      gain: 0,
      pan: 0,
      muted: false,
      solo: false,
      denoiser: 0,
      low: 0,
      saturation: 0,
      autoGain: 0,
      hasAppliedProcessing: false,
      tubeDrive: 0,
      reverb: 0,
      hpf: 20,
      effectMode: 'manual',
      lowMid: 0,
      mid: 0,
      presence: 0,
      lpf: 20000,
      gainNode: null,
      panNode: null,
      denoiserNode: null,
      lowNode: null,
      saturationNode: null,
      tubeNode: null,
      dryNode: null,
      wetNode: null,
      reverbDelay: null,
      hpfNode: null,
      lowMidNode: null,
      midNode: null,
      presenceNode: null,
      lpfNode: null,
      source: null,
    };
  }));

  stems.push(...loadedStems);
  
  // Render UI immediately
  renderTracks();
  updateMixAssistant();
  toggleMasteringVisibility();
  updateMixStateBadge();
  
  // Run detection asynchronously for first stem only
  if (stems.length > 0) {
    detectedKeyElement.textContent = 'Analyzing...';
    detectedTempoElement.textContent = 'Analyzing...';
    
    // Use setTimeout to defer detection and keep UI responsive
    setTimeout(async () => {
      try {
        const key = await detectKey(stems[0].buffer);
        detectedKeyElement.textContent = key;
      } catch (e) {
        detectedKeyElement.textContent = 'N/A';
      }
    }, 10);
    
    setTimeout(async () => {
      try {
        const tempo = await detectTempo(stems[0].buffer);
        detectedTempoElement.textContent = tempo > 0 ? `${tempo} BPM` : '—';
      } catch (e) {
        detectedTempoElement.textContent = '—';
      }
    }, 10);
  }
}

function stopPlayback() {
  if (!isPlaying) return;
  stems.forEach((stem) => {
    if (stem.source) {
      stem.source.stop();
      stem.source.disconnect();
      stem.source = null;
    }
  });
  isPlaying = false;
  stopButton.disabled = true;
  playButton.disabled = false;
}

function playPlayback() {
  if (isPlaying || !stems.length) return;
  ensureAudioContext();
  stems.forEach((stem) => {
    if (stem.source) return;
    const source = audioContext.createBufferSource();
    source.buffer = stem.buffer;
    const gainNode = audioContext.createGain();
    const panNode = audioContext.createStereoPanner();
    gainNode.gain.value = stem.muted ? 0 : getEffectiveStemGain(stem);
    panNode.pan.value = clamp(stem.pan * (1 + stereoWidth / 100), -1, 1);

    const useEffectChain = shouldUseEffectChain(stem);
    if (!useEffectChain) {
      source.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(masterGainNode);
      source.start();
      stem.source = source;
      stem.gainNode = gainNode;
      stem.panNode = panNode;
      stem.denoiserNode = null;
      stem.lowNode = null;
      stem.saturationNode = null;
      stem.tubeNode = null;
      stem.dryNode = null;
      stem.wetNode = null;
      stem.reverbDelay = null;
      stem.hpfNode = null;
      stem.lowMidNode = null;
      stem.midNode = null;
      stem.presenceNode = null;
      stem.lpfNode = null;
      source.onended = () => {
        stem.source = null;
        stem.gainNode = null;
        stem.panNode = null;
        if (!stems.some((s) => s.source)) {
          isPlaying = false;
          stopButton.disabled = true;
          playButton.disabled = false;
        }
      };
      return;
    }
    
    // Per-stem denoiser (noise gate using compressor)
    const denoiserNode = audioContext.createDynamicsCompressor();
    denoiserNode.threshold.value = useEffectChain ? -60 + (100 - stem.denoiser) * 0.6 : -100;
    denoiserNode.ratio.value = useEffectChain ? 10 : 1;
    denoiserNode.attack.value = 0.005;
    denoiserNode.release.value = 0.1;
    
    // Per-stem low shelf filter
    const lowNode = audioContext.createBiquadFilter();
    lowNode.type = 'lowShelf';
    lowNode.frequency.value = 100;
    lowNode.gain.value = useEffectChain ? stem.low : 0;
    
    // Create per-stem EQ nodes
    const hpfNode = audioContext.createBiquadFilter();
    hpfNode.type = 'highpass';
    hpfNode.frequency.value = useEffectChain ? stem.hpf : 20;
    
    const lowMidNode = audioContext.createBiquadFilter();
    lowMidNode.type = 'peaking';
    lowMidNode.frequency.value = 250;
    lowMidNode.Q.value = 0.7;
    lowMidNode.gain.value = useEffectChain ? stem.lowMid : 0;
    
    const midNode = audioContext.createBiquadFilter();
    midNode.type = 'peaking';
    midNode.frequency.value = 1000;
    midNode.Q.value = 0.7;
    midNode.gain.value = useEffectChain ? stem.mid : 0;
    
    const presenceNode = audioContext.createBiquadFilter();
    presenceNode.type = 'peaking';
    presenceNode.frequency.value = 4000;
    presenceNode.Q.value = 0.7;
    presenceNode.gain.value = useEffectChain ? stem.presence : 0;
    
    const lpfNode = audioContext.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = useEffectChain ? stem.lpf : 20000;
    
// Per-stem saturation effect
    const saturationNode = audioContext.createWaveShaper();
    saturationNode.oversample = '2x';
    saturationNode.curve = useEffectChain ? makeSaturation(stem.saturation) : makeSaturation(0);
    
    // Per-stem tube effect
    const tubeNode = audioContext.createWaveShaper();
    tubeNode.oversample = '4x';
    tubeNode.curve = useEffectChain ? makeTubeDistortion(stem.tubeDrive / 10) : makeTubeDistortion(0);
    
    // Per-stem reverb
    const dryNode = audioContext.createGain();
    dryNode.gain.value = useEffectChain ? 1 - (stem.reverb / 100) * 0.8 : 1;
    const wetNode = audioContext.createGain();
    wetNode.gain.value = useEffectChain ? (stem.reverb / 100) * 0.5 : 0;
    const reverbDelay = audioContext.createDelay(5);
    reverbDelay.delayTime.value = useEffectChain ? 0.3 + (stem.reverb / 100) * 0.4 : 0.3;
    const reverbFeedback = audioContext.createGain();
    reverbFeedback.gain.value = 0.3;

    // Connect per-stem chain: source -> gain -> denoiser -> low -> pan -> hpf -> lowMid -> mid -> presence -> lpf -> saturation -> tube -> dry/wet -> reverb -> master
    source.connect(gainNode);
    gainNode.connect(denoiserNode);
    denoiserNode.connect(lowNode);
    lowNode.connect(panNode);
    panNode.connect(hpfNode);
    hpfNode.connect(lowMidNode);
    lowMidNode.connect(midNode);
    midNode.connect(presenceNode);
    presenceNode.connect(lpfNode);
    lpfNode.connect(saturationNode);
    saturationNode.connect(tubeNode);
    tubeNode.connect(dryNode);
    tubeNode.connect(wetNode);
    dryNode.connect(masterGainNode);
    wetNode.connect(reverbDelay);
    reverbDelay.connect(reverbFeedback);
    reverbFeedback.connect(reverbDelay);
    reverbDelay.connect(masterGainNode);
    
    source.start();
    stem.source = source;
    stem.gainNode = gainNode;
    stem.panNode = panNode;
    stem.denoiserNode = denoiserNode;
    stem.lowNode = lowNode;
    stem.saturationNode = saturationNode;
    stem.tubeNode = tubeNode;
    stem.dryNode = dryNode;
    stem.wetNode = wetNode;
    stem.reverbDelay = reverbDelay;
    stem.hpfNode = hpfNode;
    stem.lowMidNode = lowMidNode;
    stem.midNode = midNode;
    stem.presenceNode = presenceNode;
    stem.lpfNode = lpfNode;

    // Handle natural playback end
    source.onended = () => {
      stem.source = null;
      stem.gainNode = null;
      stem.panNode = null;
      stem.denoiserNode = null;
      stem.lowNode = null;
      stem.saturationNode = null;
      stem.tubeNode = null;
      stem.dryNode = null;
      stem.wetNode = null;
      stem.reverbDelay = null;
      stem.hpfNode = null;
      stem.lowMidNode = null;
      stem.midNode = null;
      stem.presenceNode = null;
      stem.lpfNode = null;
      if (!stems.some((s) => s.source)) {
        isPlaying = false;
        stopButton.disabled = true;
        playButton.disabled = false;
      }
    };
  });
  isPlaying = true;
  stopButton.disabled = false;
  playButton.disabled = true;
  updateMeter();
}

async function exportMix() {
  if (!stems.length) return;
  ensureAudioContext();
  const sampleRate = audioContext.sampleRate;
  const tailSeconds = 2;
  const maxLength = stems.reduce((max, stem) => Math.max(max, stem.buffer.length), 0);
  const offlineLength = maxLength + Math.ceil(sampleRate * tailSeconds);
  const offlineContext = new OfflineAudioContext(2, offlineLength, sampleRate);
  
  // Compression and output
  const offlineMasterGain = offlineContext.createGain();
  const useMastering = shouldUseMasteringChain(currentPresetName, Number(masterGainControl.value), Number(thresholdControl.value), Number(ratioControl.value));
  offlineMasterGain.gain.value = useMastering ? Math.pow(10, Number(masterGainControl.value) / 20) : 1;
  const offlineCompressor = offlineContext.createDynamicsCompressor();
  offlineCompressor.threshold.value = useMastering ? Number(thresholdControl.value) : -100;
  offlineCompressor.ratio.value = useMastering ? Number(ratioControl.value) : 1;
  offlineCompressor.attack.value = useMastering ? 0.005 : 0.001;
  offlineCompressor.release.value = useMastering ? 0.1 : 0.001;
  
  offlineMasterGain.connect(offlineCompressor);
  offlineCompressor.connect(offlineContext.destination);

  stems.forEach((stem) => {
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = stem.buffer;
    const useEffectChain = shouldUseEffectChain(stem);
    
    const gainNode = offlineContext.createGain();
    const panNode = offlineContext.createStereoPanner();
    const isMuted = stems.some((s) => s.solo) ? !stem.solo : stem.muted;
    gainNode.gain.value = isMuted ? 0 : getEffectiveStemGain(stem);
    panNode.pan.value = clamp(stem.pan * (1 + stereoWidth / 100), -1, 1);

    if (!useEffectChain) {
      bufferSource.connect(gainNode);
      gainNode.connect(panNode);
      panNode.connect(offlineMasterGain);
      bufferSource.start();
      return;
    }

    // Per-stem denoiser (noise gate using compressor)
    const denoiserNode = offlineContext.createDynamicsCompressor();
    denoiserNode.threshold.value = useEffectChain ? -60 + (100 - stem.denoiser) * 0.6 : -100;
    denoiserNode.ratio.value = useEffectChain ? 10 : 1;
    denoiserNode.attack.value = 0.005;
    denoiserNode.release.value = 0.1;

    // Per-stem low shelf filter
    const lowNode = offlineContext.createBiquadFilter();
    lowNode.type = 'lowShelf';
    lowNode.frequency.value = 100;
    lowNode.gain.value = useEffectChain ? stem.low : 0;

    // Per-stem EQ nodes
    const hpfNode = offlineContext.createBiquadFilter();
    hpfNode.type = 'highpass';
    hpfNode.frequency.value = useEffectChain ? stem.hpf : 20;
    
    const lowMidNode = offlineContext.createBiquadFilter();
    lowMidNode.type = 'peaking';
    lowMidNode.frequency.value = 250;
    lowMidNode.Q.value = 0.7;
    lowMidNode.gain.value = useEffectChain ? stem.lowMid : 0;
    
    const midNode = offlineContext.createBiquadFilter();
    midNode.type = 'peaking';
    midNode.frequency.value = 1000;
    midNode.Q.value = 0.7;
    midNode.gain.value = useEffectChain ? stem.mid : 0;
    
    const presenceNode = offlineContext.createBiquadFilter();
    presenceNode.type = 'peaking';
    presenceNode.frequency.value = 4000;
    presenceNode.Q.value = 0.7;
    presenceNode.gain.value = useEffectChain ? stem.presence : 0;
    
    const lpfNode = offlineContext.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = useEffectChain ? stem.lpf : 20000;

    // Per-stem saturation effect
    const saturationNode = offlineContext.createWaveShaper();
    saturationNode.oversample = '2x';
    saturationNode.curve = useEffectChain ? makeSaturation(stem.saturation) : makeSaturation(0);
    
    // Per-stem tube effect
    const tubeNode = offlineContext.createWaveShaper();
    tubeNode.oversample = '4x';
    tubeNode.curve = useEffectChain ? makeTubeDistortion(stem.tubeDrive / 10) : makeTubeDistortion(0);
    
    // Per-stem reverb
    const dryNode = offlineContext.createGain();
    dryNode.gain.value = useEffectChain ? 1 - (stem.reverb / 100) * 0.8 : 1;
    const wetNode = offlineContext.createGain();
    wetNode.gain.value = useEffectChain ? (stem.reverb / 100) * 0.5 : 0;
    const reverbDelay = offlineContext.createDelay(5);
    reverbDelay.delayTime.value = useEffectChain ? 0.3 + (stem.reverb / 100) * 0.4 : 0.3;
    const reverbFeedback = offlineContext.createGain();
    reverbFeedback.gain.value = 0.3;
    
    // Connect per-stem chain (matches playback chain)
    bufferSource.connect(gainNode);
    gainNode.connect(denoiserNode);
    denoiserNode.connect(lowNode);
    lowNode.connect(panNode);
    panNode.connect(hpfNode);
    hpfNode.connect(lowMidNode);
    lowMidNode.connect(midNode);
    midNode.connect(presenceNode);
    presenceNode.connect(lpfNode);
    lpfNode.connect(saturationNode);
    saturationNode.connect(tubeNode);
    tubeNode.connect(dryNode);
    tubeNode.connect(wetNode);
    dryNode.connect(offlineMasterGain);
    wetNode.connect(reverbDelay);
    reverbDelay.connect(reverbFeedback);
    reverbFeedback.connect(reverbDelay);
    reverbDelay.connect(offlineMasterGain);
    
    bufferSource.start();
  });

  const renderedBuffer = await offlineContext.startRendering();
  const wav = encodeWAV(renderedBuffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'mixed-mastered.wav';
  anchor.click();
  URL.revokeObjectURL(url);
}

function encodeWAV(buffer) {
  const numChannels = 2;
  const sampleRate = buffer.sampleRate;
  const format = 3;
  const samples = mergeBuffers(buffer);
  const dataLength = samples.length * 4;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 4, true);
  view.setUint16(32, numChannels * 4, true);
  view.setUint16(34, 32, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  floatTo32BitPCM(view, 44, samples);
  return view;
}

function mergeBuffers(buffer) {
  const length = buffer.length;
  const result = new Float32Array(length * 2);
  const channelData0 = buffer.getChannelData(0);
  const channelData1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : channelData0;
  for (let i = 0; i < length; i += 1) {
    result[i * 2] = channelData0[i];
    result[i * 2 + 1] = channelData1[i];
  }
  return result;
}

function floatTo32BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i += 1) {
    output.setFloat32(offset + i * 4, input[i], true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

fileInput.addEventListener('change', (event) => {
  loadFiles(event.target.files);
});

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragover');
  if (event.dataTransfer?.files) {
    loadFiles(event.dataTransfer.files);
  }
});

playButton.addEventListener('click', () => {
  if (audioContext?.state === 'suspended') {
    audioContext.resume();
  }
  playPlayback();
});

stopButton.addEventListener('click', () => {
  stopPlayback();
});

exportButton.addEventListener('click', async () => {
  if (!currentUser) {
    alert('Please login first to export your mix');
    loginModal.style.display = 'block';
    return;
  }

  if (currentUser.provider === 'demo' || currentUser.id === 'demo') {
    try {
      await exportMix();
      alert('Export successful! Your preview mix has been downloaded.');
    } catch (error) {
      alert(`Export failed: ${error.message}`);
    }
    return;
  }

  if (!stripe) {
    alert('Payment is currently unavailable in preview mode. Please use the demo account to export.');
    return;
  }

  paymentModal.style.display = 'block';
});

// Payment submission
submitPaymentBtn.addEventListener('click', async () => {
  if (!stripe || !cardElement) {
    try {
      await exportMix();
      paymentModal.style.display = 'none';
      alert('Export successful in preview mode.');
    } catch (error) {
      alert(`Export failed: ${error.message}`);
    }
    return;
  }

  submitPaymentBtn.disabled = true;
  submitPaymentBtn.textContent = 'Processing...';

  try {
    const paymentIntentData = await tryBackendRequest('/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 2.99,
        email: currentUser.email,
        userId: currentUser.id
      })
    });

    if (!stripe || !paymentIntentData?.clientSecret) {
      await exportMix();
      paymentModal.style.display = 'none';
      alert('Payment service is currently unavailable. Export is continuing in preview mode.');
      return;
    }

    const { paymentIntent, error } = await stripe.confirmCardPayment(paymentIntentData.clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: { email: currentUser.email }
      }
    });

    if (error) {
      alert(`Payment failed: ${error.message}`);
      submitPaymentBtn.disabled = false;
      submitPaymentBtn.textContent = 'Complete Payment & Export';
      return;
    }

    if (paymentIntent.status === 'succeeded') {
      await tryBackendRequest('/process-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          userId: currentUser.id,
          filename: 'mixed-mastered.wav'
        })
      });

      await exportMix();
      paymentModal.style.display = 'none';
      alert('Export successful!');
    }
  } catch (error) {
    await exportMix();
    paymentModal.style.display = 'none';
    alert(`Preview export continued because the payment backend is unavailable: ${error.message}`);
  } finally {
    submitPaymentBtn.disabled = false;
    submitPaymentBtn.textContent = 'Complete Payment & Export';
  }
});

masterGainControl.addEventListener('input', updateMasteringControls);
thresholdControl.addEventListener('input', updateMasteringControls);
ratioControl.addEventListener('input', updateMasteringControls);
stereoWidthControl?.addEventListener('input', () => {
  stereoWidth = Number(stereoWidthControl.value);
  updateMasteringControls();
});
autoLevelingToggle?.addEventListener('change', () => {
  autoLevelingEnabled = autoLevelingToggle.checked;
  applyAutoLeveling();
  updateMasteringControls();
});
masteringPresetSelect?.addEventListener('change', () => {
  applyMasteringPreset(masteringPresetSelect.value);
});
applyPresetBtn?.addEventListener('click', () => {
  applyMasteringPreset(masteringPresetSelect?.value || 'balanced');
});
applyAssistantPresetBtn?.addEventListener('click', () => {
  applyMasteringPreset(applyAssistantPresetBtn.dataset.preset || 'balanced');
});
saveSnapshotBtn?.addEventListener('click', saveSnapshot);
restoreSnapshotBtn?.addEventListener('click', restoreSnapshot);
compareModeBtn?.addEventListener('click', () => {
  setCompareMode(!compareModeEnabled);
});
updateCompareModeUI();

// Set current year in footer
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Keyboard shortcuts (Space = play/stop, Ctrl/Cmd+E = export)
document.addEventListener('keydown', (e) => {
  // Ignore when typing in inputs
  if (e.target.matches('input, textarea, select')) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (isPlaying) {
      stopPlayback();
    } else {
      if (audioContext?.state === 'suspended') audioContext.resume();
      playPlayback();
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    exportButton.click();
  }
});
