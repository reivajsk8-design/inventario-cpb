// js/camera-scanner.js — Escaneo por cámara usando BarcodeDetector API
let _stream   = null;
let _af       = null;
let _scanning = false;
let _detector = null;
let _onEan    = null;
let _ctx      = null;      // AudioContext de la cámara
let _soundCtx = null;      // AudioContext persistente para sonidos sin cámara

function _getSoundCtx() {
  if (!_soundCtx || _soundCtx.state === 'closed') {
    _soundCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _soundCtx;
}

function _beep() {
  try {
    if (!_ctx) return;
    const osc  = _ctx.createOscillator();
    const gain = _ctx.createGain();
    osc.connect(gain);
    gain.connect(_ctx.destination);
    osc.frequency.value = 1760;
    const t = _ctx.currentTime;
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.12);
  } catch {}
}

// Arpegio estilo 1-up de Mario: G5 C6 E6 G6 E6 G6
export function beepMatch() {
  try {
    const ctx  = _ctx || _getSoundCtx();
    const play = () => {
      const notes = [784, 1047, 1319, 1568, 1319, 1568];
      const step  = 0.09;
      const t0    = ctx.currentTime + 0.02;
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type            = 'square';
        osc.frequency.value = freq;
        const t = t0 + i * step;
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + step * 0.85);
        osc.start(t);
        osc.stop(t + step);
      });
    };
    ctx.state === 'running' ? play() : ctx.resume().then(play);
  } catch {}
}

export function cameraSupported() {
  return !!(navigator.mediaDevices?.getUserMedia && 'BarcodeDetector' in window);
}

export async function openCamera(onEan, toast) {
  _onEan = onEan;
  const overlay  = document.getElementById('cam-scanner-overlay');
  const video    = document.getElementById('cam-scanner-video');
  const noDetect = document.getElementById('cam-scanner-no-detect');

  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Cámara no disponible en este navegador', 'amber');
    return;
  }

  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = _stream;
    overlay.classList.remove('hidden');

    if ('BarcodeDetector' in window) {
      _detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
      _scanning = true;
      _loop(video);
    } else {
      noDetect.classList.remove('hidden');
    }
  } catch {
    toast('No se pudo acceder a la cámara', 'red');
  }
}

async function _loop(video) {
  if (!_scanning || !_detector) return;
  try {
    if (video.readyState >= 2) {
      const codes = await _detector.detect(video);
      if (codes.length > 0) {
        _scanning = false;
        if (_af) { cancelAnimationFrame(_af); _af = null; }
        _beep();
        _onEan(codes[0].rawValue);
        return;
      }
    }
  } catch {}
  _af = requestAnimationFrame(() => _loop(video));
}

export function resumeCamera() {
  if (!_stream) return;
  _scanning = true;
  const video = document.getElementById('cam-scanner-video');
  _loop(video);
}

export function closeCamera() {
  _scanning = false;
  if (_af) { cancelAnimationFrame(_af); _af = null; }
  if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
  if (_ctx) { _ctx.close(); _ctx = null; }
  document.getElementById('cam-scanner-overlay')?.classList.add('hidden');
  document.getElementById('cam-scanner-no-detect')?.classList.add('hidden');
}
