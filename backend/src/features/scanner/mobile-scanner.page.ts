/**
 * The phone-facing page, as a string.
 *
 * Kept in TypeScript rather than an .html file on purpose: the backend is
 * compiled with `tsc`, which copies no other file types, so an .html asset would
 * work in development and then be silently missing from a packaged build. A
 * module cannot go missing.
 *
 * The page is deliberately tiny and self-contained. It must not pull in the ERP
 * bundle: everything served on :3011 is reachable by any device on the shop
 * Wi-Fi, so the less that lives there the better. It holds no product data, no
 * customer data, and no credential beyond a session token in `sessionStorage`
 * that dies with the tab.
 *
 * Manual entry only in this version. Camera capture needs a secure context,
 * which plain http to a LAN IP is not, and that is a separate decision to make
 * against a real shop phone.
 *
 * The nonce is base64url, so it contains nothing that needs HTML escaping in an
 * attribute.
 */
export function renderMobileScannerPage(nonce: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    '<title>HomeConnect Scanner</title>',
    '<style nonce="' + nonce + '">',
    CSS,
    '</style>',
    '</head>',
    '<body>',
    '<h1>HomeConnect Scanner</h1>',
    '<p class="sub">Local network scanner / ماسح الشبكة المحلية</p>',
    '<p id="status" class="status idle">Loading…</p>',

    '<section id="pair-panel">',
    '<form id="pair-form">',
    '<label for="pair-code">Pairing code / رمز الربط</label>',
    '<input id="pair-code" name="pair-code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required />',
    '<label for="pair-label">Device name / اسم الجهاز</label>',
    '<input id="pair-label" name="pair-label" maxlength="40" placeholder="Shop phone" />',
    '<button type="submit">Pair phone / ربط الهاتف</button>',
    '</form>',
    '</section>',

    '<section id="scan-panel" hidden>',
    '<form id="scan-form">',
    '<label for="code">Barcode or SKU / الباركود أو رمز المنتج</label>',
    '<input id="code" name="code" autocomplete="off" autocapitalize="characters" maxlength="64" required />',
    '<button type="submit">Send scan / إرسال المسح</button>',
    '</form>',
    // Revealed only when the browser actually exposes both camera capture and
    // barcode decoding. On plain http to a LAN IP it stays hidden and the page
    // behaves exactly as it did before the camera existed.
    '<button type="button" id="camera-toggle" class="secondary" hidden>Use camera / استخدام الكاميرا</button>',
    '<video id="camera" playsinline muted hidden></video>',
    '<p id="result"></p>',
    '<p class="sub">Paired as <span id="device-name"></span></p>',
    '<button type="button" id="unpair" class="secondary">Unpair / إلغاء الربط</button>',
    '</section>',

    '<script nonce="' + nonce + '">',
    SCRIPT,
    '</script>',
    '</body>',
    '</html>',
  ].join('\n');
}

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 1.25rem;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  background: #f8fafc; color: #0f172a;
}
h1 { font-size: 1.15rem; margin: 0 0 0.25rem; }
p.sub { margin: 0 0 1.25rem; font-size: 0.8rem; color: #64748b; }
form { display: flex; flex-direction: column; gap: 0.75rem; }
label { font-size: 0.8rem; font-weight: 600; color: #334155; }
input {
  width: 100%; padding: 0.85rem; font-size: 1.05rem;
  border: 1px solid #cbd5e1; border-radius: 0.6rem; background: #fff;
}
button {
  padding: 0.85rem; font-size: 1rem; font-weight: 600;
  border: 0; border-radius: 0.6rem; background: #059669; color: #fff;
}
button.secondary { background: #e2e8f0; color: #334155; margin-top: 1rem; }
.status {
  margin: 0 0 1rem; padding: 0.7rem 0.85rem; border-radius: 0.6rem;
  font-size: 0.9rem; font-weight: 600;
  background: #e2e8f0; color: #334155;
}
.status.good { background: #d1fae5; color: #065f46; }
.status.warn { background: #fef3c7; color: #92400e; }
.status.bad  { background: #fee2e2; color: #991b1b; }
#result { font-family: ui-monospace, monospace; font-size: 0.9rem; color: #334155; min-height: 1.2rem; word-break: break-all; }
#camera { width: 100%; margin-top: 0.75rem; border-radius: 0.6rem; background: #000; aspect-ratio: 4 / 3; object-fit: cover; }
[hidden] { display: none !important; }
`;

const SCRIPT = `
var state = { token: sessionStorage.getItem('hc.scanner.token'), label: sessionStorage.getItem('hc.scanner.label') };

function el(id) { return document.getElementById(id); }
function show(id, visible) { el(id).hidden = !visible; }

function setStatus(text, kind) {
  var node = el('status');
  node.textContent = text;
  node.className = 'status ' + (kind || 'idle');
}

function render() {
  var paired = Boolean(state.token);
  show('pair-panel', !paired);
  show('scan-panel', paired);
  if (paired) {
    el('device-name').textContent = state.label || 'This phone';
    el('code').focus();
  }
}

function forget() {
  sessionStorage.removeItem('hc.scanner.token');
  sessionStorage.removeItem('hc.scanner.label');
  state.token = null;
  state.label = null;
  el('result').textContent = '';
  setStatus('Not paired / غير مرتبط', 'idle');
  render();
}

function post(path, body, useSession) {
  var headers = { 'Content-Type': 'application/json' };
  if (useSession && state.token) { headers['X-Scanner-Session'] = state.token; }
  return fetch(path, { method: 'POST', headers: headers, body: JSON.stringify(body) })
    .then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        return { ok: response.ok, status: response.status, payload: payload };
      });
    });
}

el('pair-form').addEventListener('submit', function (event) {
  event.preventDefault();
  var code = el('pair-code').value.trim();
  var label = el('pair-label').value.trim();
  if (!code) { return; }
  setStatus('Pairing… / جارٍ الربط', 'idle');
  post('/api/v1/scanner/pair', { code: code, deviceLabel: label }, false).then(function (result) {
    if (!result.ok) {
      setStatus('Pairing failed / فشل الربط', 'bad');
      return;
    }
    state.token = result.payload.data.token;
    state.label = result.payload.data.deviceLabel;
    sessionStorage.setItem('hc.scanner.token', state.token);
    sessionStorage.setItem('hc.scanner.label', state.label);
    el('pair-code').value = '';
    setStatus('Connected / متصل', 'good');
    render();
  }).catch(function () {
    setStatus('Cannot reach the PC / تعذر الوصول إلى الجهاز', 'bad');
  });
});

el('scan-form').addEventListener('submit', function (event) {
  event.preventDefault();
  var code = el('code').value.trim();
  if (!code) { return; }
  setStatus('Sending… / جارٍ الإرسال', 'idle');
  post('/api/v1/scanner/events', { code: code }, true).then(function (result) {
    if (result.status === 401) {
      forget();
      setStatus('Session ended, pair again / انتهت الجلسة، أعد الربط', 'bad');
      return;
    }
    if (!result.ok) {
      setStatus('Scan rejected / تم رفض المسح', 'bad');
      return;
    }
    var scan = result.payload.data;
    el('code').value = '';
    el('code').focus();
    if (scan.status === 'FOUND' && scan.product) {
      setStatus('Product found / تم العثور على المنتج', 'good');
      el('result').textContent = scan.product.name + ' — ' + scan.product.model + ' — ' + scan.product.sku;
    } else if (scan.status === 'NOT_FOUND') {
      setStatus('Product not found / لم يتم العثور على المنتج', 'warn');
      el('result').textContent = scan.normalizedCode || code;
    } else {
      setStatus('Unreadable code / رمز غير صالح', 'warn');
      el('result').textContent = '';
    }
  }).catch(function () {
    setStatus('Cannot reach the PC / تعذر الوصول إلى الجهاز', 'bad');
  });
});

el('unpair').addEventListener('click', function () { stopCamera(); forget(); });

/*
 * Camera capture, strictly as an enhancement.
 *
 * Both APIs are required and neither is assumed. Over plain http to a LAN IP the
 * page is not a secure context, so navigator.mediaDevices is undefined and none
 * of this ever runs — the button stays hidden and manual entry is the whole
 * interface, exactly as before.
 */
var cameraSupported = Boolean(
  navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.BarcodeDetector
);
var stream = null;
var detector = null;
var scanTimer = null;
var lastSent = '';

function stopCamera() {
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  if (stream) { stream.getTracks().forEach(function (track) { track.stop(); }); stream = null; }
  el('camera').hidden = true;
  el('camera-toggle').textContent = 'Use camera / استخدام الكاميرا';
}

function readFrame() {
  if (!detector || !stream) { return; }
  detector.detect(el('camera')).then(function (results) {
    if (!results || !results.length) { return; }
    var value = String(results[0].rawValue || '').trim();
    // The same barcode stays in frame for many frames; only act on a change.
    if (!value || value === lastSent) { return; }
    lastSent = value;
    el('code').value = value;
    el('scan-form').requestSubmit ? el('scan-form').requestSubmit() : el('scan-form').dispatchEvent(new Event('submit', { cancelable: true }));
  }).catch(function () { /* a dropped frame is not worth reporting */ });
}

function startCamera() {
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(function (media) {
      stream = media;
      var video = el('camera');
      video.srcObject = media;
      video.hidden = false;
      return video.play();
    })
    .then(function () {
      return window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats() : null;
    })
    .then(function (supported) {
      var wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
      var formats = supported ? wanted.filter(function (f) { return supported.indexOf(f) !== -1; }) : wanted;
      detector = formats.length ? new window.BarcodeDetector({ formats: formats }) : new window.BarcodeDetector();
      lastSent = '';
      scanTimer = setInterval(readFrame, 400);
      el('camera-toggle').textContent = 'Stop camera / إيقاف الكاميرا';
      setStatus('Camera ready / الكاميرا جاهزة', 'good');
    })
    .catch(function () {
      stopCamera();
      setStatus('Camera unavailable, type the code / الكاميرا غير متاحة، أدخل الرمز يدوياً', 'warn');
    });
}

if (cameraSupported) {
  el('camera-toggle').hidden = false;
  el('camera-toggle').addEventListener('click', function () {
    if (stream) { stopCamera(); setStatus('Connected / متصل', 'good'); }
    else { startCamera(); }
  });
}

if (state.token) {
  fetch('/api/v1/scanner/session', { headers: { 'X-Scanner-Session': state.token } })
    .then(function (response) {
      if (response.ok) { setStatus('Connected / متصل', 'good'); render(); }
      else { forget(); }
    })
    .catch(function () { setStatus('Cannot reach the PC / تعذر الوصول إلى الجهاز', 'bad'); });
} else {
  setStatus('Not paired / غير مرتبط', 'idle');
}

render();
`;
