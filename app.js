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
const demoLoginBtn = document.getElementById('demoLoginBtn');
const submitPaymentBtn = document.getElementById('submit-payment');

let audioContext;
let stems = [];
let masterGainNode;
let compressorNode;
let analyserNode;
let isPlaying = false;
let currentUser = null;
let stripe = null;
let cardElement = null;

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
  
  initStripe();
  ensureAudioContext();
  updateMasteringControls();
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

// Login/Logout handlers
loginBtn.addEventListener('click', () => {
  loginModal.style.display = 'block';
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  currentUser = null;
  updateAuthUI();
  stems = [];
  renderTracks();
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

function updateMasteringControls() {
  const gain = Number(masterGainControl.value);
  const threshold = Number(thresholdControl.value);
  const ratio = Number(ratioControl.value);
  if (masterGainNode) masterGainNode.gain.value = Math.pow(10, gain / 20);
  if (compressorNode) compressorNode.threshold.value = threshold;
  if (compressorNode) compressorNode.ratio.value = ratio;
  masterGainValue.textContent = formatDb(gain);
  thresholdValue.textContent = `${threshold} dB`;
  ratioValue.textContent = `${ratio.toFixed(1)}:1`;
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

function createTrackCard(stem, index) {
  const card = document.createElement('article');
  card.className = 'track-card';
  card.innerHTML = `
    <h3>${stem.name}</h3>
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
        <details open>
          <summary>Effects</summary>
          
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
      
      // Update display value
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
        } else if (control === 'low') {
          valueSpan.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`;
        } else {
          valueSpan.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`;
        }
      }

      // Apply to audio nodes if playing
      if (stems[trackIndex].gainNode) {
        if (control === 'gain') {
          stems[trackIndex].gainNode.gain.value = Math.pow(10, value / 20);
        } else if (control === 'pan') {
          stems[trackIndex].panNode.pan.value = value;
        } else if (control === 'denoiser') {
          if (stems[trackIndex].denoiserNode) {
            stems[trackIndex].denoiserNode.threshold.value = -60 + (100 - value) * 0.6;
          }
        } else if (control === 'low') {
          if (stems[trackIndex].lowNode) {
            stems[trackIndex].lowNode.gain.value = value;
          }
} else if (control === 'saturation') {
          if (stems[trackIndex].saturationNode) {
            stems[trackIndex].saturationNode.curve = makeSaturation(value);
          }
        } else if (control === 'tubeDrive') {
          if (stems[trackIndex].tubeNode) {
            stems[trackIndex].tubeNode.curve = makeTubeDistortion(value / 10);
          }
        } else if (control === 'reverb') {
          if (stems[trackIndex].dryNode) {
            stems[trackIndex].dryNode.gain.value = 1 - (value / 100) * 0.8;
            stems[trackIndex].wetNode.gain.value = (value / 100) * 0.5;
            stems[trackIndex].reverbDelay.delayTime.value = 0.3 + (value / 100) * 0.4;
          }
        } else if (control === 'hpf') {
          if (stems[trackIndex].hpfNode) {
            stems[trackIndex].hpfNode.frequency.value = value;
          }
        } else if (control === 'lowMid') {
          if (stems[trackIndex].lowMidNode) {
            stems[trackIndex].lowMidNode.gain.value = value;
          }
        } else if (control === 'mid') {
          if (stems[trackIndex].midNode) {
            stems[trackIndex].midNode.gain.value = value;
          }
        } else if (control === 'presence') {
          if (stems[trackIndex].presenceNode) {
            stems[trackIndex].presenceNode.gain.value = value;
          }
        } else if (control === 'lpf') {
          if (stems[trackIndex].lpfNode) {
            stems[trackIndex].lpfNode.frequency.value = value;
          }
        }
      }
    });
  });

  card.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      const trackIndex = Number(button.dataset.track);
      const action = button.dataset.action;
      if (action === 'mute') {
        stems[trackIndex].muted = !stems[trackIndex].muted;
        if (stems[trackIndex].gainNode) {
          stems[trackIndex].gainNode.gain.value = stems[trackIndex].muted ? 0 : Math.pow(10, stems[trackIndex].gain / 20);
        }
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
      stem.gainNode.gain.value = shouldBeMuted ? 0 : Math.pow(10, stem.gain / 20);
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
    return;
  }

  stems.forEach((stem, index) => trackList.appendChild(createTrackCard(stem, index)));
  exportButton.disabled = false;
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
  
  // Load all files first
  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    
    stems.push({
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
      tubeDrive: 0,
      reverb: 0,
      hpf: 20,
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
    });
  }
  
  // Render UI immediately
  renderTracks();
  
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
    
    // Track gain and pan
    const gainNode = audioContext.createGain();
    const panNode = audioContext.createStereoPanner();
    gainNode.gain.value = stem.muted ? 0 : Math.pow(10, stem.gain / 20);
    panNode.pan.value = stem.pan;
    
    // Per-stem denoiser (noise gate using compressor)
    const denoiserNode = audioContext.createDynamicsCompressor();
    denoiserNode.threshold.value = -60 + (100 - stem.denoiser) * 0.6;
    denoiserNode.ratio.value = 10;
    denoiserNode.attack.value = 0.005;
    denoiserNode.release.value = 0.1;
    
    // Per-stem low shelf filter
    const lowNode = audioContext.createBiquadFilter();
    lowNode.type = 'lowShelf';
    lowNode.frequency.value = 100;
    lowNode.gain.value = stem.low;
    
    // Create per-stem EQ nodes
    const hpfNode = audioContext.createBiquadFilter();
    hpfNode.type = 'highpass';
    hpfNode.frequency.value = stem.hpf;
    
    const lowMidNode = audioContext.createBiquadFilter();
    lowMidNode.type = 'peaking';
    lowMidNode.frequency.value = 250;
    lowMidNode.Q.value = 0.7;
    lowMidNode.gain.value = stem.lowMid;
    
    const midNode = audioContext.createBiquadFilter();
    midNode.type = 'peaking';
    midNode.frequency.value = 1000;
    midNode.Q.value = 0.7;
    midNode.gain.value = stem.mid;
    
    const presenceNode = audioContext.createBiquadFilter();
    presenceNode.type = 'peaking';
    presenceNode.frequency.value = 4000;
    presenceNode.Q.value = 0.7;
    presenceNode.gain.value = stem.presence;
    
    const lpfNode = audioContext.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = stem.lpf;
    
// Per-stem saturation effect
    const saturationNode = audioContext.createWaveShaper();
    saturationNode.oversample = '2x';
    saturationNode.curve = makeSaturation(stem.saturation);
    
    // Per-stem tube effect
    const tubeNode = audioContext.createWaveShaper();
    tubeNode.oversample = '4x';
    tubeNode.curve = makeTubeDistortion(stem.tubeDrive / 10);
    
    // Per-stem reverb
    const dryNode = audioContext.createGain();
    dryNode.gain.value = 1 - (stem.reverb / 100) * 0.8;
    const wetNode = audioContext.createGain();
    wetNode.gain.value = (stem.reverb / 100) * 0.5;
    const reverbDelay = audioContext.createDelay(5);
    reverbDelay.delayTime.value = 0.3 + (stem.reverb / 100) * 0.4;
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
  const maxLength = stems.reduce((max, stem) => Math.max(max, stem.buffer.length), 0);
  const offlineContext = new OfflineAudioContext(2, maxLength, sampleRate);
  
  // Compression and output
  const offlineMasterGain = offlineContext.createGain();
  offlineMasterGain.gain.value = Math.pow(10, Number(masterGainControl.value) / 20);
  const offlineCompressor = offlineContext.createDynamicsCompressor();
  offlineCompressor.threshold.value = Number(thresholdControl.value);
  offlineCompressor.ratio.value = Number(ratioControl.value);
  
  offlineMasterGain.connect(offlineCompressor);
  offlineCompressor.connect(offlineContext.destination);

  stems.forEach((stem) => {
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = stem.buffer;
    
// Per-stem gain and pan
    const gainNode = offlineContext.createGain();
    const panNode = offlineContext.createStereoPanner();
    const isMuted = stems.some((s) => s.solo) ? !stem.solo : stem.muted;
    gainNode.gain.value = isMuted ? 0 : Math.pow(10, stem.gain / 20);
    panNode.pan.value = stem.pan;

    // Per-stem denoiser (noise gate using compressor)
    const denoiserNode = offlineContext.createDynamicsCompressor();
    denoiserNode.threshold.value = -60 + (100 - stem.denoiser) * 0.6;
    denoiserNode.ratio.value = 10;
    denoiserNode.attack.value = 0.005;
    denoiserNode.release.value = 0.1;

    // Per-stem low shelf filter
    const lowNode = offlineContext.createBiquadFilter();
    lowNode.type = 'lowShelf';
    lowNode.frequency.value = 100;
    lowNode.gain.value = stem.low;

    // Per-stem EQ nodes
    const hpfNode = offlineContext.createBiquadFilter();
    hpfNode.type = 'highpass';
    hpfNode.frequency.value = stem.hpf;
    
    const lowMidNode = offlineContext.createBiquadFilter();
    lowMidNode.type = 'peaking';
    lowMidNode.frequency.value = 250;
    lowMidNode.Q.value = 0.7;
    lowMidNode.gain.value = stem.lowMid;
    
    const midNode = offlineContext.createBiquadFilter();
    midNode.type = 'peaking';
    midNode.frequency.value = 1000;
    midNode.Q.value = 0.7;
    midNode.gain.value = stem.mid;
    
    const presenceNode = offlineContext.createBiquadFilter();
    presenceNode.type = 'peaking';
    presenceNode.frequency.value = 4000;
    presenceNode.Q.value = 0.7;
    presenceNode.gain.value = stem.presence;
    
    const lpfNode = offlineContext.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = stem.lpf;

    // Per-stem saturation effect
    const saturationNode = offlineContext.createWaveShaper();
    saturationNode.oversample = '2x';
    saturationNode.curve = makeSaturation(stem.saturation);
    
    // Per-stem tube effect
    const tubeNode = offlineContext.createWaveShaper();
    tubeNode.oversample = '4x';
    tubeNode.curve = makeTubeDistortion(stem.tubeDrive / 10);
    
    // Per-stem reverb
    const dryNode = offlineContext.createGain();
    dryNode.gain.value = 1 - (stem.reverb / 100) * 0.8;
    const wetNode = offlineContext.createGain();
    wetNode.gain.value = (stem.reverb / 100) * 0.5;
    const reverbDelay = offlineContext.createDelay(5);
    reverbDelay.delayTime.value = 0.3 + (stem.reverb / 100) * 0.4;
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
  const format = 1;
  const samples = mergeBuffers(buffer);
  const dataLength = samples.length * 2;
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
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  floatTo16BitPCM(view, 44, samples);
  return view;
}

function mergeBuffers(buffer) {
  const length = buffer.length;
  const result = new Float32Array(length * 2);
  const channelData0 = buffer.getChannelData(0);
  const channelData1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : channelData0;
  for (let i = 0; i < length; i += 1) {
    result[i * 2] = Math.max(-1, Math.min(1, channelData0[i]));
    result[i * 2 + 1] = Math.max(-1, Math.min(1, channelData1[i]));
  }
  return result;
}

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i += 1) {
    let s = Math.max(-1, Math.min(1, input[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7fff;
    output.setInt16(offset + i * 2, s, true);
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
    const response = await fetch('/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 2.99,
        email: currentUser.email,
        userId: currentUser.id
      })
    });

    const { clientSecret } = await response.json();

    const { paymentIntent, error } = await stripe.confirmCardPayment(clientSecret, {
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
      await fetch('/process-export', {
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
    alert(`Error: ${error.message}`);
  } finally {
    submitPaymentBtn.disabled = false;
    submitPaymentBtn.textContent = 'Complete Payment & Export';
  }
});

masterGainControl.addEventListener('input', updateMasteringControls);
thresholdControl.addEventListener('input', updateMasteringControls);
ratioControl.addEventListener('input', updateMasteringControls);

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
