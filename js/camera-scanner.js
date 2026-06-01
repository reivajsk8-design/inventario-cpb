// js/camera-scanner.js — Escaneo por cámara usando BarcodeDetector API
let _stream   = null;
let _af       = null;
let _scanning = false;
let _detector = null;
let _onEan    = null;

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
  document.getElementById('cam-scanner-overlay')?.classList.add('hidden');
  document.getElementById('cam-scanner-no-detect')?.classList.add('hidden');
}
