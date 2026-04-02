    /* ============ Analyzer (spectrogram + waveform) ============ */
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var specCanvas = document.getElementById('spectrogram');
    var waveCanvas = document.getElementById('wave');
    var sctx = specCanvas.getContext('2d', { willReadFrequently: true });
    var wctx = waveCanvas.getContext('2d');
    var analyser = null, timeArray = null, freqArray = null, visLoopOn = false;
    var TARGET_FFT = 8192*2, MIN_HZ = 20, rowToBin = null;

    function resizeCanvasToDisplaySize(canvas) {
      var cssW = Math.max(1, canvas.clientWidth | 0);
      var cssH = Math.max(1, canvas.clientHeight | 0);
      var needW = Math.max(1, Math.floor(cssW * dpr));
      var needH = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== needW || canvas.height !== needH) {
        canvas.width = needW; canvas.height = needH; return true;
      }
      return false;
    }
    function resizeAll() {
      var a = resizeCanvasToDisplaySize(specCanvas);
      var b = resizeCanvasToDisplaySize(waveCanvas);
      if ((a || b) && analyser && audioCtx) {
        rowToBin = buildRowToBin(specCanvas.height, audioCtx.sampleRate, analyser.fftSize, MIN_HZ);
      }
    }
    window.addEventListener('resize', resizeAll);
    new ResizeObserver(resizeAll).observe(document.getElementById('strip'));

    function buildRowToBin(heightPx, sampleRate, fftSize, minHz) {
      var nyq = sampleRate / 2;
      var bins = fftSize >> 1;
      var out = new Int16Array(heightPx);
      for (var y = 0; y < heightPx; y++) {
        var t = 1 - (y / (heightPx - 1));
        var hz = minHz * Math.pow(nyq / minHz, t);
        var bin = Math.min(bins - 1, Math.max(0, Math.round(hz * fftSize / sampleRate)));
        out[y] = bin;
      }
      return out;
    }
    function heatColor01(t) {
      var clamp01 = function (v) { return Math.max(0, Math.min(1, v)); }
      t = clamp01(t);
      if (t < 0.04) return [0, 12, 34];
      var c0 = [0, 12, 34], c1 = [247, 113, 0], c2 = [251, 250, 110];
      if (t < 0.85) {
        var u = (t - 0.04) / 0.81;
        return [
          Math.round(c0[0] + (c1[0] - c0[0]) * u),
          Math.round(c0[1] + (c1[1] - c0[1]) * u),
          Math.round(c0[2] + (c1[2] - c0[2]) * u),
        ];
      } else {
        var u2 = (t - 0.85) / 0.15;
        return [
          Math.round(c1[0] + (c2[0] - c1[0]) * u2),
          Math.round(c1[1] + (c2[1] - c1[1]) * u2),
          Math.round(c1[2] + (c2[2] - c1[2]) * u2),
        ];
      }
    }
    function renderWave() {
      var w = waveCanvas.width, h = waveCanvas.height;
      wctx.clearRect(0, 0, w, h);
      if (!analyser || !timeArray) return;
      analyser.getFloatTimeDomainData(timeArray);
      wctx.lineWidth = Math.max(1, Math.floor(dpr));
      wctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ok') || '#2ec27e';
      wctx.beginPath();
      var step = timeArray.length / w;
      for (var x = 0; x < w; x++) {
        var v = timeArray[(x * step) | 0];
        var y = (h >> 1) - v * (h >> 1);
        if (x === 0) wctx.moveTo(x, y); else wctx.lineTo(x, y);
      }
      wctx.stroke();
    }
    function renderSpectrogram() {
  if (!analyser || !freqArray || !rowToBin) return;
  const w = specCanvas.width, h = specCanvas.height;

  // scroll left by chosen amount
  const shift = 10;
  sctx.globalCompositeOperation = 'copy';
  sctx.drawImage(specCanvas, shift, 0, w - shift, h, 0, 0, w - shift, h);
  sctx.globalCompositeOperation = 'source-over';

  analyser.getByteFrequencyData(freqArray);

  const col = sctx.createImageData(1, h);
  const N = freqArray.length;

  for (let y = 0; y < h; y++) {
    const c = rowToBin[y] | 0;
    const band = Math.max(1, (c * 0.02) | 0);
    const lo = Math.max(0, c - band);
    const hi = Math.min(N - 1, c + band);

    let maxV = 0;
    for (let k = lo; k <= hi; k++) if (freqArray[k] > maxV) maxV = freqArray[k];
    const t = maxV / 255;
    const [r, g, b] = heatColor01(t);
    const idx = 4 * y;
    col.data[idx] = r; col.data[idx + 1] = g; col.data[idx + 2] = b; col.data[idx + 3] = 255;
  }

  for (let x = 0; x < shift; x++) sctx.putImageData(col, w - shift + x, 0);
}
    function startVisLoop() {
      if (visLoopOn) return;
      visLoopOn = true;
      (function tick() {
        if (!visLoopOn) return;
        renderWave(); renderSpectrogram();
        requestAnimationFrame(tick);
      })();
    }
    
    (function enableDragResize() {
      var bar = document.getElementById('resizer');
      var root = document.documentElement;
      var startY = 0, startH = 0, dragging = false;
      function px(v) { return String(Math.round(v)) + 'px'; }
      function onPointerMove(e) {
        if (!dragging) return;
        var dy = e.clientY - startY;
        var minH = Math.max(120, window.innerHeight * 0.20);
        var maxH = window.innerHeight * 0.95;
        var next = Math.max(minH, Math.min(maxH, startH + dy));
        root.style.setProperty('--strip-h', px(next));
        resizeAll();
      }
      function onPointerUp() {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('dragging');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }
      bar.addEventListener('pointerdown', function (e) {
        dragging = true;
        document.body.classList.add('dragging');
        startY = e.clientY;
        startH = document.getElementById('strip').getBoundingClientRect().height;
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      });
      bar.addEventListener('dblclick', function () {
        document.documentElement.style.setProperty('--strip-h', '20vh');
        resizeAll();
      });
    })();
    function renderWave() {
      // lazy-init visualization state so no global edit is needed
      if (!window.vis) window.vis = {
        normalize: true,
        targetPeak: 0.95,
        gain: 1.0,
        gainSmooth: 0.9,  // 0.9–0.98 = steadier
        dcBlock: true,
        trigger: true,
        trigLevel: 0.0,
        trigHyst: 0.02,
        trigSearch: 2048
      };

      var w = waveCanvas.width, h = waveCanvas.height;
      wctx.clearRect(0, 0, w, h);
      if (!analyser || !timeArray) return;

      // 1) grab frame
      analyser.getFloatTimeDomainData(timeArray);

      // 2) stats + optional DC block
      var stats = frameStats(timeArray);
      var mean = vis.dcBlock ? stats.mean : 0;

      // 3) peak normalization (smoothed)
      if (vis.normalize) {
        var eps = 1e-6;
        var desired = vis.targetPeak / Math.max(eps, stats.peak);
        vis.gain = vis.gain * vis.gainSmooth + desired * (1 - vis.gainSmooth);
      } else {
        vis.gain = 1.0;
      }

      // 4) optional trigger to stabilize phase
      var startIdx = 0;
      if (vis.trigger) {
        startIdx = findRisingTrigger(timeArray, vis.trigLevel + mean, vis.trigHyst, vis.trigSearch);
      }

      // 5) draw
      wctx.lineWidth = Math.max(1, Math.floor(dpr));
      wctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ok') || '#2ec27e';
      wctx.beginPath();

      var samples = timeArray.length;
      var remain = samples - startIdx;
      var step = Math.max(1, remain / w);

      for (var x = 0; x < w; x++) {
        var i = (startIdx + x * step) | 0;
        if (i >= samples) break;
        var v = (timeArray[i] - mean) * vis.gain;
        if (v > 1) v = 1; else if (v < -1) v = -1; // clamp
        var y = (h >> 1) - v * (h >> 1);
        if (x === 0) wctx.moveTo(x, y); else wctx.lineTo(x, y);
      }
      wctx.stroke();
    }
    function frameStats(buf) {
      var n = buf.length, sum = 0, peak = 0;
      for (var i = 0; i < n; i++) {
        var v = buf[i];
        sum += v;
        var a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
      return { mean: sum / n, peak: peak };
    }

    function findRisingTrigger(buf, level, hyst, maxLook) {
      var hi = level + hyst, lo = level - hyst;
      var armed = true, n = Math.min(buf.length - 1, maxLook | 0);
      for (var i = 1; i < n; i++) {
        var p = buf[i - 1], c = buf[i];
        // Schmitt: arm below 'lo', fire crossing 'hi'
        if (armed && p < lo && c >= hi) return i;
        if (c < lo) armed = true;
      }
      return 0; // fallback
    }
    /* ============ Synth core ============ */
    var F_MIN = 10, F_MAX = 20000;
    var ABS_CAP = 1.0, AMP_MAX = 0.99;
    var $ = function (sel) { return document.querySelector(sel); };
    var clamp = function (v, lo, hi) { return Math.min(Math.max(v, lo), hi); };
    var toPct = function (x) { return (x * 100).toFixed(2) + '%'; };
    var ln = Math.log, LOG_RANGE = ln(F_MAX / F_MIN);
    var linToLogHz = function (x) { return Math.round(F_MIN * Math.exp(LOG_RANGE * x)); };
    var hzToLin = function (f) { return ln(clamp(f, F_MIN, F_MAX) / F_MIN) / LOG_RANGE; };
    var xfClamp = function (min, max, val) { return Math.max(min, Math.min(max, val)); };
    var NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    function partialFreq(n, base) { return n * base; }
    function nearestNoteNameFromHz(hz) {
      if (!isFinite(hz) || hz <= 0) return '?';
      var midi = Math.round(69 + 12 * (Math.log(hz / 440) / Math.log(2)));
      var idx = ((midi % 12) + 12) % 12;
      return NOTE_NAMES[idx];
    }
    function nearestNoteLabelFromHz(hz) {
      if (!isFinite(hz) || hz <= 0) return '?';
      var midi = Math.round(69 + 12 * (Math.log(hz / 440) / Math.log(2)));
      var oct = Math.floor(midi / 12) - 1;
      return nearestNoteNameFromHz(hz) + String(oct);
    }
    function partialTitleText(n, base) {
      var hz = partialFreq(n, base);
      return String(n) + ' | ' + String(Math.round(hz)) + ' Hz | ' + nearestNoteLabelFromHz(hz);
    }
    function groupToggleButtonTextForIndex(i, base, enabled) {
      var hz = partialFreq(i + 1, base);
      return (enabled ? 'Mute all ' : 'Unmute all ') + nearestNoteNameFromHz(hz);
    }
    function crossfadeDurationSec(f0) { var t = 6 / clamp(f0, F_MIN, F_MAX); return xfClamp(0.02, 0.08, t); }
    function nyquist() { return (audioCtx ? audioCtx.sampleRate / 2 : 22050); }
    function limitHz() { return Math.min(F_MAX, nyquist()); }
    function maxHarmonicsFor(base) {
      var lim = limitHz(); var N = 0;
      for (var n = 1; n < 8192; n++) { if (partialFreq(n, base) <= lim) N = n; else break; }
      return N;
    }

    var audioCtx = null;
    var currentEngine = null;
    var presetMode = 'custom';          // 'saw' | 'square' | 'custom'
    var presetBase = '';                // remembers last pressed preset to seed new coeffs in custom
    var userTouchedAmps = false;
    var rebuildTimer = null;
    var lastMaxN = 0;

    var freqNum = $('#freqNum'), freqSlider = $('#freqSlider');
    var master = $('#master'), masterOut = $('#masterOut');
    var toggleBtn = $('#togglePlay');
    var bankEl = $('#bank'), countNote = $('#countNote');
    var presetSawBtn = $('#presetSaw'), presetSquareBtn = $('#presetSquare');
    var groupsEl = document.getElementById('groups');
    var groupsToggleAllBtn = document.getElementById('groupsToggleAll');

    var bank = [];
    var groupState = new Map();
    var rowMuteSaved = new Map();
    var rowForceEnabled = new Set();
    var AMP_EPS = 1e-9;

    function sumAmps() { return Array.isArray(bank) ? bank.reduce(function (s, b) { return s + (b && b.amp || 0); }, 0) : 0; }
    function sumCoeffs() { return Array.isArray(bank) ? bank.reduce(function (s, b) { return s + (b && b.coeff || 0); }, 0) : 0; }
    function setMasterFromSum() {
      var s = sumAmps(); if (!isFinite(s)) return;
      master.value = (s * 100).toFixed(2);
      masterOut.textContent = (s * 100).toFixed(2) + '% (Sum Amp)';
    }

    function refreshWaveDebounced() {
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(function () {
        rebuildTimer = null;
        if (!currentEngine || !audioCtx) return;

        crossfadeToNewEngine();
      }, 50); // a bit more debounce to reduce churn
    }

    function oddBase(n) { while (n % 2 === 0) n /= 2; return n; }
    function groupKeyForIndex(i) { var n = i + 1; var m = n; while (m % 2 === 0) m /= 2; return 'O' + m; }
    function groupTintForIndex(i) {
      var p = oddBase(i + 1);
      return {
        h: (p * 53 + 17) % 360,
        s: 72 + (p % 3) * 4,
        l: 50 + (p % 2) * 6
      };
    }
    function isIndexEnabled(i) { var g = groupState.get(groupKeyForIndex(i)); return !g || g.enabled || rowForceEnabled.has(i); }
    function getSavedForIndex(i) { var g = groupState.get(groupKeyForIndex(i)); if (!g) return undefined; return g.saved.get(i); }
    function setSavedForIndex(i, val) { var g = groupState.get(groupKeyForIndex(i)); if (!g) return; g.saved.set(i, val); }
    function getUnderlyingAmp(i) {
      var enabled = isIndexEnabled(i);
      if (enabled) return bank[i] && bank[i].amp ? bank[i].amp : 0;
      var sv = getSavedForIndex(i);
      return (typeof sv === 'number') ? sv : (bank[i] && bank[i].amp ? bank[i].amp : 0);
    }
    function pruneRowMuteSaved() {
      var keys = Array.from(rowMuteSaved.keys());
      keys.forEach(function (i) { if (i < 0 || i >= bank.length) rowMuteSaved.delete(i); });
    }
    function pruneRowForceEnabled() {
      var keys = Array.from(rowForceEnabled.values());
      keys.forEach(function (i) { if (i < 0 || i >= bank.length) rowForceEnabled.delete(i); });
    }
    function isRowManuallyMuted(i) { return rowMuteSaved.has(i); }
    function isRowForceEnabled(i) { return rowForceEnabled.has(i); }
    function isRowEffectivelyMuted(i) { return !isIndexEnabled(i) || isRowManuallyMuted(i); }
    function applyRowManualMutes() {
      rowMuteSaved.forEach(function (_, i) {
        if (!bank[i]) return;
        if (isIndexEnabled(i)) bank[i].amp = 0;
      });
    }
    function toggleRowMute(i) {
      if (i < 0 || i >= bank.length || !bank[i]) return;
      if (presetMode !== 'custom') presetMode = 'custom';
      userTouchedAmps = true;
      var key = groupKeyForIndex(i);
      var g = groupState.get(key);
      var groupEnabled = !g || g.enabled;
      var currentlyMuted = isRowEffectivelyMuted(i);

      if (currentlyMuted) {
        var restore = isRowManuallyMuted(i)
          ? clamp(rowMuteSaved.get(i), 0, AMP_MAX)
          : clamp(getUnderlyingAmp(i), 0, AMP_MAX);
        rowMuteSaved.delete(i);
        if (!groupEnabled) rowForceEnabled.add(i);
        onAmpChange(i, restore);
      } else {
        rowMuteSaved.set(i, clamp(getUnderlyingAmp(i), 0, AMP_MAX));
        onAmpChange(i, 0);
        if (!groupEnabled) rowForceEnabled.delete(i);
      }
      syncGroupCheckboxVisual(key);
      updateAmpUI(true);
    }
    function groupManualMutedCount(g) {
      if (!g || !Array.isArray(g.indices) || g.indices.length === 0) return 0;
      return g.indices.reduce(function (n, i) { return n + (isRowManuallyMuted(i) ? 1 : 0); }, 0);
    }
    function groupForcedEnabledCount(g) {
      if (!g || !Array.isArray(g.indices) || g.indices.length === 0) return 0;
      return g.indices.reduce(function (n, i) { return n + (isRowForceEnabled(i) ? 1 : 0); }, 0);
    }
    function isGroupPartiallyMuted(g) {
      if (!g || !Array.isArray(g.indices) || g.indices.length === 0) return false;
      if (g.enabled) {
        var muted = groupManualMutedCount(g);
        return muted > 0 && muted < g.indices.length;
      }
      var unmuted = groupForcedEnabledCount(g);
      return unmuted > 0 && unmuted < g.indices.length;
    }
    function syncGroupCheckboxVisual(key) {
      var g = groupState.get(key);
      if (!g || !groupsEl) return;
      var cb = groupsEl.querySelector('input[type="checkbox"][data-group-key="' + key + '"]');
      if (!cb) return;
      cb.checked = !!g.enabled;
      cb.indeterminate = isGroupPartiallyMuted(g);
    }
    function syncAllGroupCheckboxVisuals() {
      groupState.forEach(function (_, key) { syncGroupCheckboxVisual(key); });
    }

    function reapplyGroupMutes() {
      groupState.forEach(function (g) {
        if (!g.enabled) {
          g.indices.forEach(function (i) {
            if (!bank[i]) return;
            if (isRowForceEnabled(i)) {
              setSavedForIndex(i, bank[i].amp);
            } else {
              setSavedForIndex(i, bank[i].amp);
              bank[i].amp = 0;
            }
          });
        }
      });
      applyRowManualMutes();
      syncAllGroupCheckboxVisuals();
      updateAmpUI(true); setMasterFromSum(); refreshWaveDebounced();
    }

    function updateCoeffUI() {
      bank.forEach(function (c) { if (c && c.coeffEl) c.coeffEl.textContent = 'Coeff: ' + toPct(c.coeff); });
    }
    function syncCoeffsToAmpsNormalized() {
      var s = sumAmps();
      if (s <= 1e-12) return; // nothing to sync
      bank.forEach(function (c) { if (c) c.coeff = (c.amp || 0) / s; });
      updateCoeffUI();
    }

    function allocateByCoeffs(target, opts) {
      opts = opts || {};
      var enabledOnly = !!opts.enabledOnly;

      target = clamp(target, 0, ABS_CAP);
      if (!Array.isArray(bank) || bank.length === 0) { updateAmpUI(true); setMasterFromSum(); return; }

      var idxs = [];
      for (var i = 0; i < bank.length; i++) {
        if (!bank[i]) continue;
        if (enabledOnly ? isIndexEnabled(i) : true) idxs.push(i);
      }
      if (idxs.length === 0) { updateAmpUI(true); setMasterFromSum(); return; }

      var sc = idxs.reduce(function (s, i) { return s + (bank[i].coeff || 0); }, 0);
      if (sc <= 1e-12) { updateAmpUI(true); setMasterFromSum(); return; }

      idxs.forEach(function (i) { bank[i].amp = 0; });
      idxs.forEach(function (i) {
        var share = target * ((bank[i].coeff || 0) / sc);
        bank[i].amp = Math.min(AMP_MAX, share);
      });

      for (var iter = 0; iter < 6; iter++) {
        var total = idxs.reduce(function (s, i) { return s + (bank[i].amp || 0); }, 0);
        var rem = target - total;
        if (rem <= 1e-9) break;

        var weights = idxs.map(function (i) {
          return (bank[i].amp < AMP_MAX - 1e-9) ? (bank[i].coeff || 0) : 0;
        });
        var wSum = weights.reduce(function (s, w) { return s + w; }, 0);
        if (wSum <= 1e-12) break;

        idxs.forEach(function (i, k) {
          if (weights[k] > 0) {
            var add = rem * (weights[k] / wSum);
            bank[i].amp = Math.min(AMP_MAX, bank[i].amp + add);
          }
        });
      }

      updateAmpUI(true);
      setMasterFromSum();

    }


    function scaleToTargetWithCap(target) {
      target = clamp(target, 0, ABS_CAP);
      var cur = sumAmps();
      if (cur === 0) { allocateByCoeffs(target, { enabledOnly: true }); return; }

      var k = target / cur;
      bank.forEach(function (cell) { cell.amp = clamp(cell.amp * k, 0, AMP_MAX); });

      for (var iter = 0; iter < 3; iter++) {
        var total = sumAmps(); if (total >= target - 1e-6) break;
        var available = bank.map(function (c) { return Math.max(0, AMP_MAX - c.amp); });
        var sumAvail = available.reduce(function (s, a) { return s + a; }, 0); if (sumAvail <= 1e-9) break;
        var need = target - total; var sc = sumCoeffs() || 1;
        bank.forEach(function (c, i) { var share = need * ((c.coeff || 0) / sc); var add = Math.min(share, available[i]); c.amp += add; });
      }

      updateAmpUI(true);
      setMasterFromSum();

    }


    function coeffDefaultForIndex(i) {
      var n = i + 1;
      if (presetBase === 'saw') return 1 / n;
      if (presetBase === 'square') return (n % 2 === 1) ? 1 / n : 0;
      return 0; // fallback for true custom with no baseline
    }

    function buildBankUI(base, carry, opts) {
      carry = carry || { coeffs: [], amps: [] }; opts = opts || {};
      var N = maxHarmonicsFor(base);
      bankEl.innerHTML = '';
      bank = Array.from({ length: N }, function (_, i) {
        var n = i + 1;
        var row = document.createElement('div'); row.className = 'bank-row';
        var tint = groupTintForIndex(i);
        row.style.setProperty('--group-h', String(tint.h));
        row.style.setProperty('--group-s', String(tint.s) + '%');
        row.style.setProperty('--group-l', String(tint.l) + '%');
        var title = document.createElement('div'); title.className = 'bank-title'; title.textContent = partialTitleText(n, base);
        var muteBtn = document.createElement('button'); muteBtn.type = 'button'; muteBtn.className = 'row-mute';
        muteBtn.textContent = isRowEffectivelyMuted(i) ? 'Unmute' : 'Mute';
        muteBtn.addEventListener('click', function () { toggleRowMute(i); });
        var key = groupKeyForIndex(i);
        var gNow = groupState.get(key);
        var groupEnabledNow = !gNow || gNow.enabled;
        var groupMuteBtn = document.createElement('button'); groupMuteBtn.type = 'button'; groupMuteBtn.className = 'row-mute';
        groupMuteBtn.textContent = groupToggleButtonTextForIndex(i, base, groupEnabledNow);
        groupMuteBtn.classList.toggle('is-unmute', !groupEnabledNow);
        groupMuteBtn.title = 'Toggle this row group';
        groupMuteBtn.addEventListener('click', function () {
          var key2 = groupKeyForIndex(i);
          var g2 = groupState.get(key2);
          var enabled = !g2 || g2.enabled;
          onGroupToggle(key2, !enabled);
        });
        var head = document.createElement('div'); head.className = 'bank-head';
        head.appendChild(title);
        head.appendChild(muteBtn);
        head.appendChild(groupMuteBtn);

        var slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = String(AMP_MAX); slider.step = '0.0001';
        // NEW: default amp for brand new partials is 0 (not 0.3), we'll redistribute explicitly
        var ampInit = (typeof carry.amps[i] === 'number') ? clamp(carry.amps[i], 0, AMP_MAX) : 0;
        slider.value = ampInit.toFixed(4);
        var ampEl = document.createElement('div'); ampEl.className = 'out'; ampEl.textContent = 'Amp: ' + toPct(ampInit);

        // Coeff init: prefer carry; else baseline preset shape even in custom; else 0
        var coeffInit = (typeof carry.coeffs[i] === 'number') ? clamp(carry.coeffs[i], 0, 1)
          : (presetMode === 'custom' ? coeffDefaultForIndex(i)
            : (presetMode === 'saw' ? 1 / (i + 1) : ((i + 1) % 2 === 1 ? 1 / (i + 1) : 0)));
        var coeffEl = document.createElement('div'); coeffEl.className = 'out'; coeffEl.textContent = 'Coeff: ' + toPct(coeffInit);

        slider.addEventListener('input', function () {
          // Flip to custom on first human tweak and sync coeffs to amps
          if (presetMode !== 'custom') presetMode = 'custom';
          userTouchedAmps = true;
          var newA = parseFloat(slider.value);
          if (newA > AMP_EPS && isRowManuallyMuted(i)) rowMuteSaved.delete(i);
          onAmpChange(i, newA);
          syncCoeffsToAmpsNormalized();
        });

        bankEl.appendChild(row);
        row.appendChild(head); row.appendChild(slider); row.appendChild(ampEl); row.appendChild(coeffEl);
        return {
          idx: n, coeff: coeffInit, amp: ampInit, rowEl: row, titleEl: title,
          muteBtnEl: muteBtn, groupMuteBtnEl: groupMuteBtn, sliderEl: slider, ampEl: ampEl, coeffEl: coeffEl
        };
      });
      pruneRowMuteSaved();
      pruneRowForceEnabled();
      lastMaxN = N;
      rebuildGroups(base);
      if (!opts.skipFit) {
        reapplyGroupMutes();
        enforceCap(-1, ABS_CAP);
        setMasterFromSum();
        refreshWaveDebounced();
      }
    }

    function updateBankTitlesOnly(base) {
      bank.forEach(function (cell, i) {
        var n = i + 1;
        cell.titleEl.textContent = partialTitleText(n, base);
        if (cell.groupMuteBtnEl) {
          var g = groupState.get(groupKeyForIndex(i));
          var groupEnabled = !g || g.enabled;
          cell.groupMuteBtnEl.textContent = groupToggleButtonTextForIndex(i, base, groupEnabled);
          cell.groupMuteBtnEl.classList.toggle('is-unmute', !groupEnabled);
        }
      });
      renderGroups(base);
    }

    function onAmpChange(pivotIdx, newAmp) {
      if (!Array.isArray(bank) || bank.length === 0) return;
      if (pivotIdx < 0 || pivotIdx >= bank.length || !bank[pivotIdx]) return;
      var nextAmp = clamp(newAmp, 0, AMP_MAX);
      var key = groupKeyForIndex(pivotIdx);
      if (nextAmp > AMP_EPS && isRowManuallyMuted(pivotIdx)) rowMuteSaved.delete(pivotIdx);

      if (!isIndexEnabled(pivotIdx)) {
        // Editing a muted partial should change its stored value and keep audible amp muted.
        setSavedForIndex(pivotIdx, nextAmp);
        bank[pivotIdx].amp = 0;
        updateAmpUI(true);
        setMasterFromSum();
        syncGroupCheckboxVisual(key);
        refreshWaveDebounced();
        return;
      }

      bank[pivotIdx].amp = nextAmp;
      if (isRowForceEnabled(pivotIdx)) setSavedForIndex(pivotIdx, bank[pivotIdx].amp);
      var s = sumAmps();
      if (s > ABS_CAP + 1e-12) { enforceCap(pivotIdx, ABS_CAP); }
      else { updateAmpUI(); setMasterFromSum(); }

      // Keep coeffs in sync with user intent
      syncCoeffsToAmpsNormalized();
      syncGroupCheckboxVisual(key);

      // Avoid audible re-attack by patching running oscillator when possible.
      if (!updateCurrentWaveInPlace()) refreshWaveDebounced();
    }


    function enforceCap(pivotIdx, targetSum) {
      if (!Array.isArray(bank) || bank.length === 0) { setMasterFromSum(); return; }
      targetSum = clamp(targetSum, 0, ABS_CAP);
      var curSum = sumAmps();
      var eps = 1e-12;

      if (curSum <= targetSum + eps) { updateAmpUI(true); setMasterFromSum(); return; }

      var N = bank.length;
      var validPivot = (pivotIdx >= 0 && pivotIdx < N && bank[pivotIdx]);

      if (!validPivot) {
        var scale = targetSum / (curSum || 1);
        bank.forEach(function (c) { if (c) c.amp = clamp(c.amp * scale, 0, AMP_MAX); });
        updateAmpUI(true); setMasterFromSum();
        return;
      }

      var pivotAmp = clamp(bank[pivotIdx].amp, 0, AMP_MAX);
      if (pivotAmp >= targetSum) {
        for (var i = 0; i < N; i++) { if (i !== pivotIdx && bank[i]) bank[i].amp = 0; }
        bank[pivotIdx].amp = Math.min(targetSum, AMP_MAX);
        updateAmpUI(true); setMasterFromSum();
        return;
      }

      var headroom = targetSum - pivotAmp;
      var idxs = bank.map(function (_, i) { return i; }).filter(function (i) { return i !== pivotIdx; });
      var sumOthers = idxs.reduce(function (s, i) { return s + (bank[i] && bank[i].amp ? bank[i].amp : 0); }, 0);
      if (sumOthers > eps) {
        var scale2 = headroom / sumOthers;
        idxs.forEach(function (i) { if (bank[i]) bank[i].amp = clamp(bank[i].amp * scale2, 0, AMP_MAX); });
      }
      var after = sumAmps();
      var diff = targetSum - after;
      if (Math.abs(diff) > 1e-6) bank[pivotIdx].amp = clamp(bank[pivotIdx].amp + diff, 0, AMP_MAX);

      updateAmpUI(true);
      setMasterFromSum();
    }


    function updateAmpUI(adjustSliders) {
      adjustSliders = !!adjustSliders;
      var sA = sumAmps();
      bank.forEach(function (cell, i) {
        if (!cell) return;
        var shownAmp = isIndexEnabled(i) ? cell.amp : getUnderlyingAmp(i);
        cell.ampEl.textContent = 'Amp: ' + toPct(shownAmp);
        if (adjustSliders && cell.sliderEl) cell.sliderEl.value = shownAmp.toFixed(4);
        if (cell.muteBtnEl) {
          var muted = isRowEffectivelyMuted(i);
          cell.muteBtnEl.textContent = muted ? 'Unmute' : 'Mute';
          cell.muteBtnEl.classList.toggle('is-unmute', muted);
          cell.muteBtnEl.setAttribute('aria-pressed', muted ? 'true' : 'false');
        }
        if (cell.groupMuteBtnEl) {
          var g = groupState.get(groupKeyForIndex(i));
          var groupEnabled = !g || g.enabled;
          cell.groupMuteBtnEl.textContent = groupToggleButtonTextForIndex(i, Number(freqNum.value), groupEnabled);
          cell.groupMuteBtnEl.classList.toggle('is-unmute', !groupEnabled);
          cell.groupMuteBtnEl.setAttribute('aria-pressed', !groupEnabled ? 'true' : 'false');
        }
      });
      var sC = (sumCoeffs() * 100).toFixed(2);
      var label = (presetMode === 'custom' ? (presetBase || 'custom') : presetMode) + (userTouchedAmps ? ' (tweaked)' : '');
      countNote.textContent = 'Partials: ' + bank.length + ' | Sum Coeff = ' + sC + '% | Sum Amp = ' + (sA * 100).toFixed(2) + '% (Master ' + master.value + '%) | Preset=' + label;
    }

    function applyPreset(kind) {
      if (!Array.isArray(bank) || bank.length === 0) { presetMode = kind; presetBase = kind; return; }
      rowMuteSaved.clear();
      rowForceEnabled.clear();
      if (kind === 'saw') {
        presetMode = 'saw'; presetBase = 'saw'; userTouchedAmps = false;
        bank.forEach(function (cell, i) { var c = 1 / (i + 1); cell.coeff = c; if (cell.coeffEl) cell.coeffEl.textContent = 'Coeff: ' + toPct(c); });
        allocateByCoeffs(ABS_CAP);
      } else if (kind === 'square') {
        presetMode = 'square'; presetBase = 'square'; userTouchedAmps = false;
        bank.forEach(function (cell, i) { var n = i + 1; var c = (n % 2 === 1) ? 1 / n : 0; cell.coeff = c; if (cell.coeffEl) cell.coeffEl.textContent = 'Coeff: ' + toPct(c); });
        allocateByCoeffs(ABS_CAP);
      }
      reapplyGroupMutes();
      refreshWaveDebounced();
    }

    async function ensureContext() {
      if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = TARGET_FFT;
        analyser.smoothingTimeConstant = 0;
        timeArray = new Float32Array(analyser.fftSize);
        freqArray = new Uint8Array(analyser.frequencyBinCount);
        resizeAll();
        rowToBin = buildRowToBin(specCanvas.height, audioCtx.sampleRate, analyser.fftSize, MIN_HZ);
        startVisLoop();
      }
    }
    function connectEngineToAnalyser(engine) {
      try { if (engine && engine.gain && analyser) engine.gain.connect(analyser); } catch (_) { }
    }
    function updateCurrentWaveInPlace() {
      if (!audioCtx || !currentEngine || currentEngine.type !== 'harmonic') return false;
      try {
        var base = Number(freqNum.value);
        var N = Math.min(bank.length, maxHarmonicsFor(base));
        var real = new Float32Array(N + 1);
        var imag = new Float32Array(N + 1);
        for (var n = 1; n <= N; n++) imag[n] = bank[n - 1] && bank[n - 1].amp ? bank[n - 1].amp : 0;
        var wave = audioCtx.createPeriodicWave(real, imag, { disableNormalization: true });
        var osc = currentEngine.nodes && currentEngine.nodes[0];
        if (!osc || typeof osc.setPeriodicWave !== 'function') return false;
        osc.setPeriodicWave(wave);
        return true;
      } catch (_) {
        return false;
      }
    }
    function createHarmonicEngine(base) {
      var N = Math.min(bank.length, maxHarmonicsFor(base));
      var real = new Float32Array(N + 1);
      var imag = new Float32Array(N + 1);
      for (var n = 1; n <= N; n++) imag[n] = bank[n - 1] && bank[n - 1].amp ? bank[n - 1].amp : 0;
      var wave = audioCtx.createPeriodicWave(real, imag, { disableNormalization: true });
      var gain = audioCtx.createGain(); gain.gain.value = 0; gain.connect(audioCtx.destination);
      var osc = audioCtx.createOscillator(); osc.setPeriodicWave(wave); osc.frequency.setValueAtTime(base, audioCtx.currentTime); osc.connect(gain); osc.start();
      return { type: 'harmonic', gain: gain, nodes: [osc] };
    }
    function startEngine() {
      var base = Number(freqNum.value);
      var engine = createHarmonicEngine(base);
      var now = audioCtx.currentTime, xf = crossfadeDurationSec(base);
      engine.gain.gain.setValueAtTime(0, now); engine.gain.gain.linearRampToValueAtTime(1, now + xf);
      currentEngine = engine;
      connectEngineToAnalyser(currentEngine);
      updateButtons();
    }
    function crossfadeToNewEngine() {
      if (!audioCtx) return;
      var base = Number(freqNum.value);
      var next = createHarmonicEngine(base);
      connectEngineToAnalyser(next);
      var now = audioCtx.currentTime, xf = crossfadeDurationSec(base);
      if (currentEngine) {
        currentEngine.gain.gain.cancelScheduledValues(now);
        currentEngine.gain.gain.linearRampToValueAtTime(0, now + xf);
      }
      next.gain.gain.setValueAtTime(0, now);
      next.gain.gain.linearRampToValueAtTime(1, now + xf);
      var old = currentEngine; currentEngine = next;
      setTimeout(function () {
        try {
          if (!old) return;
          old.nodes[0].stop();
          old.nodes[0].disconnect();
          old.gain.disconnect();
        } catch (_) { }
      }, Math.ceil((xf + 0.02) * 1000));
      updateButtons();
    }
    function stopEngine() {
      if (!audioCtx || !currentEngine) return;
      var now = audioCtx.currentTime; try { currentEngine.gain.gain.linearRampToValueAtTime(0, now + 0.03); } catch (_) { }
      setTimeout(function () {
        try {
          currentEngine.nodes[0].stop();
          currentEngine.nodes[0].disconnect();
          currentEngine.gain.disconnect();
        } catch (_) { }
        currentEngine = null; updateButtons();
      }, 80);
    }
    function updateButtons() { toggleBtn.textContent = currentEngine ? 'Stop' : 'Play'; }

    function onBaseChange() {
      var base = Number(freqNum.value);
      var prevSumAudible = sumAmps();
      var prevMaxN = lastMaxN;

      var carry = {
        coeffs: bank.map(function (b) { return b && typeof b.coeff === 'number' ? b.coeff : undefined; }),
        amps: bank.map(function (b, i) { return getUnderlyingAmp(i); })
      };

      updateBankTitlesOnly(base);
      var neededMaxN = maxHarmonicsFor(base);

      if (neededMaxN !== prevMaxN) {
        buildBankUI(base, carry, { skipFit: true });
      } else {
        bank.forEach(function (cell, i) {
          if (cell) cell.amp = clamp(carry.amps[i] != null ? carry.amps[i] : cell.amp, 0, AMP_MAX);
        });
      }

      var target = Math.min(prevSumAudible, ABS_CAP);
      var countChanged = (neededMaxN !== prevMaxN);

      // IMPORTANT: when re-allocating due to harmonic-count or preset-controlled case,
      // allocate only over ENABLED partials to avoid losing audible sum into muted groups.
      if (countChanged) {
        allocateByCoeffs(target, { enabledOnly: true });
      } else if (presetMode !== 'custom' && !userTouchedAmps) {
        allocateByCoeffs(target, { enabledOnly: true });
      } else {
        // Custom+tweaked case: proportional scaling preserves audible sum even with mutes.
        scaleToTargetWithCap(target);
      }

      reapplyGroupMutes();

      if (currentEngine) {
        if (!countChanged) {
          try {
            var osc = currentEngine.nodes[0];
            var now = audioCtx.currentTime;
            osc.frequency.cancelScheduledValues(now);
            osc.frequency.setTargetAtTime(base, now, 0.01);
          } catch (_) { crossfadeToNewEngine(); }
        } else {
          crossfadeToNewEngine();
        }
      }
    }

    function rebuildGroups(base) {
      var newMap = new Map();
      var N = bank.length;

      // New groups inherit the last bulk toggle state:
      //  - true  => default enabled (Tick-all mode)
      //  - false => default disabled (Untick-all mode)
      //  - undefined => default to enabled (back-compat)
      var defaultEnabled = (typeof window.groupsDefaultEnabled === 'boolean')
        ? window.groupsDefaultEnabled
        : true;

      for (var i = 0; i < N; i++) {
        var p = oddBase(i + 1);
        var key = 'O' + p;

        var g = newMap.get(key);
        if (!g) {
          var old = groupState.get(key);
          g = {
            p: p,
            enabled: old ? old.enabled : defaultEnabled,
            indices: [],
            saved: old ? new Map(old.saved) : new Map()
          };
          newMap.set(key, g);
        }

        g.indices.push(i);

        // carry over any saved per-index amplitude if we had it before
        var old2 = groupState.get(key);
        if (old2 && old2.saved.has(i) && !g.saved.has(i)) {
          g.saved.set(i, old2.saved.get(i));
        }
      }

      groupState = newMap;
      renderGroups(base);
      updateGroupsToggleAllLabel();
    }


    function renderGroups(base) {
      groupsEl.innerHTML = '';
      var keys = Array.from(groupState.keys()).sort(function (a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
      var N = bank.length;
      keys.forEach(function (key) {
        var g = groupState.get(key);
        var p = g.p;
        var freqs = [];
        for (var n = p; n <= N; n *= 2) { var f = Math.round(partialFreq(n, Number(freqNum.value))); freqs.push(f); }
        var wrap = document.createElement('label'); wrap.className = 'group'; wrap.title = 'n=' + p + '*2^k';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = g.enabled; cb.addEventListener('change', function () { onGroupToggle(key, cb.checked); });
        cb.setAttribute('data-group-key', key);
        cb.indeterminate = isGroupPartiallyMuted(g);
        var txt = document.createElement('span');
        txt.textContent = (p === 1 ? 'n=1 octaves: ' : ('n=' + p + ' octaves: ')) + (freqs.length ? (freqs.join(', ') + ' Hz') : '(none in range)');
        wrap.appendChild(cb); wrap.appendChild(txt);
        groupsEl.appendChild(wrap);
      });
    }

    function updateGroupsToggleAllLabel() {
      var anyEnabled = Array.from(groupState.values()).some(function (g) { return g.enabled; });
      groupsToggleAllBtn.textContent = anyEnabled ? 'Untick all' : 'Tick all';
    }

    function onGroupToggle(key, enabled) {
      var g = groupState.get(key); if (!g) return; g.enabled = enabled;
      if (!enabled) {
        g.indices.forEach(function (i) {
          if (!bank[i]) return;
          var underlying = getUnderlyingAmp(i);
          g.saved.set(i, underlying);
          rowForceEnabled.delete(i);
          bank[i].amp = 0;
        });
        updateAmpUI(true); setMasterFromSum(); refreshWaveDebounced();
      } else {
        g.indices.forEach(function (i) {
          if (!bank[i]) return;
          rowForceEnabled.delete(i);
          var saved = g.saved.get(i);
          if (typeof saved === 'number') bank[i].amp = clamp(saved, 0, AMP_MAX);
        });
        applyRowManualMutes();
        if (sumAmps() > ABS_CAP + 1e-12) enforceCap(-1, ABS_CAP);
        updateAmpUI(true); setMasterFromSum(); refreshWaveDebounced();
      }
      syncGroupCheckboxVisual(key);
      updateGroupsToggleAllLabel();
    }

    function setAllGroups(enabled) {
      // Remember bulk mode for future (new) groups
      window.groupsDefaultEnabled = !!enabled;

      if (!enabled) {
        // Act like clicking "Mute" on every row one-by-one.
        bank.forEach(function (_, i) {
          if (!isRowEffectivelyMuted(i)) toggleRowMute(i);
        });
        rowForceEnabled.clear();
        groupState.forEach(function (g) { g.enabled = false; });
      } else {
        // Act like clicking "Unmute" on every row one-by-one.
        bank.forEach(function (_, i) {
          if (isRowEffectivelyMuted(i)) toggleRowMute(i);
        });
        groupState.forEach(function (g) { g.enabled = true; });
        rowForceEnabled.clear();
        rowMuteSaved.clear();
      }

      if (sumAmps() > ABS_CAP + 1e-12) enforceCap(-1, ABS_CAP);
      updateAmpUI(true);
      setMasterFromSum();
      refreshWaveDebounced();
      renderGroups(Number(freqNum.value));
      updateGroupsToggleAllLabel();
    }


    toggleBtn.addEventListener('click', async function () {
      await ensureContext();
      if (currentEngine) { stopEngine(); }
      else { startEngine(); }
    });

    presetSawBtn.addEventListener('click', function () { applyPreset('saw'); });
    presetSquareBtn.addEventListener('click', function () { applyPreset('square'); });
    groupsToggleAllBtn.addEventListener('click', function () {
      var anyEnabled = Array.from(groupState.values()).some(function (g) { return g.enabled; });
      setAllGroups(!anyEnabled);
    });

    // Frequency: keep integer always (both entry points)
    freqNum.addEventListener('input', function () {
      var f = Math.round(clamp(parseFloat(freqNum.value) || 0, F_MIN, F_MAX));
      freqNum.value = String(f);
      freqSlider.value = hzToLin(f).toFixed(4);
      onBaseChange();
    });
    freqSlider.addEventListener('input', function () {
      var x = parseFloat(freqSlider.value);
      var f = linToLogHz(x); // already Math.round
      freqNum.value = String(f);
      onBaseChange();
    });

    master.addEventListener('input', function () {
      var targetSum = clamp(parseFloat(master.value) / 100, 0, ABS_CAP);
      scaleToTargetWithCap(targetSum);
      // Master drag should not restart the voice envelope.
      if (!updateCurrentWaveInPlace()) refreshWaveDebounced();
    });

    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !/input|textarea|select/i.test((e.target.tagName || ''))) {
        e.preventDefault(); toggleBtn.click();
      }
    });

    /* ============ Tests ============ */
    function _redistribute(amps, pivotIdx, target) {
      var N = Array.isArray(amps) ? amps.length : 0;
      if (N === 0) return [];
      var clamp01 = function (v) { v = +v || 0; return Math.min(Math.max(v, 0), 1); };
      var A = amps.map(function (v) { return Math.min(clamp01(v), AMP_MAX); });
      target = clamp01(target);
      var sum = A.reduce(function (s, a) { return s + a; }, 0);
      var eps = 1e-12;
      if (sum <= target + eps) return A;
      var validPivot = (pivotIdx >= 0 && pivotIdx < N);
      if (!validPivot) {
        var scale = target / (sum || 1);
        return A.map(function (a) { return Math.min(a * scale, AMP_MAX); });
      }
      var pivotAmp = Math.min(clamp01(A[pivotIdx]), AMP_MAX);
      if (pivotAmp >= target) {
        var out = A.map(function () { return 0; }); out[pivotIdx] = Math.min(target, AMP_MAX); return out;
      }
      var headroom = target - pivotAmp;
      var sumOthers = A.reduce(function (s, a, i) { return i === pivotIdx ? s : s + a; }, 0);
      if (sumOthers <= eps) {
        var out2 = A.slice(); out2[pivotIdx] = pivotAmp; return out2;
      }
      var scale2 = headroom / sumOthers;
      var out3 = A.map(function (a, i) { return i === pivotIdx ? pivotAmp : Math.min(a * scale2, AMP_MAX); });
      var after = out3.reduce(function (s, a) { return s + a; }, 0);
      var diff = target - after;
      out3[pivotIdx] = Math.min(Math.max(out3[pivotIdx] + diff, 0), AMP_MAX);
      return out3;
    }
    function _allocByCoeffsPure(coeffs, target, ampMax) {
      ampMax = (typeof ampMax === 'number') ? ampMax : AMP_MAX;
      var sc = coeffs.reduce(function (s, c) { return s + (+c || 0); }, 0);
      if (sc <= 0) return coeffs.map(function () { return 0; });
      var amps = coeffs.map(function (c) { return Math.min(ampMax, target * ((+c || 0) / sc)); });
      for (var iter = 0; iter < 6; iter++) {
        var total = amps.reduce(function (s, a) { return s + a; }, 0);
        var rem = target - total; if (rem <= 1e-9) break;
        var weights = amps.map(function (a, i) { return a < ampMax - 1e-9 ? (+coeffs[i] || 0) : 0; });
        var wSum = weights.reduce(function (s, w) { return s + w; }, 0); if (wSum <= 1e-12) break;
        amps = amps.map(function (a, i) { return Math.min(ampMax, a + rem * (weights[i] / wSum)); });
      }
      return amps;
    }
    function _countHarmonicsPure(f0, limit) {
      var N = 0; for (var n = 1; n < 8192; n++) { if (n * f0 <= limit) N = n; else break; } return N;
    }
    function _oddBasePure(n) { var m = n; while (m % 2 === 0) m /= 2; return m; }
    function _groupToggleModel(amps, indices) {
      var saved = new Map(); var A = amps.slice();
      indices.forEach(function (i) { saved.set(i, A[i]); A[i] = 0; });
      indices.forEach(function (i) { var v = saved.get(i); if (typeof v === 'number') A[i] = v; });
      return A;
    }
    function _muteWithSavedPure(amps, savedIn, idxs) {
      var saved = new Map(savedIn); var out = amps.slice();
      idxs.forEach(function (i) { if (!saved.has(i)) saved.set(i, amps[i]); out[i] = 0; });
      return { out: out, saved: saved };
    }
    function runTests() {
      var log = [];
      var ok = function (name, cond) { log.push((cond ? '[OK]' : '[FAIL]') + ' ' + name); };
      var eq = function (a, b, eps) { eps = eps || 1e-6; return Math.abs(a - b) <= eps; };
      var arrEq = function (A, rhs, eps) { eps = eps || 1e-6; return A.length === rhs.length && A.every(function (v, i) { return eq(v, rhs[i], eps); }); };

      try { var r = _redistribute([], -1, 1); ok('A0 empty returns []', Array.isArray(r) && r.length === 0); } catch (e) { ok('A0 empty returns []', false); }
      { var r1 = _redistribute([0.2, 0.3], -1, 1); ok('A1 under cap unchanged', eq(r1[0], 0.2) && eq(r1[1], 0.3)); }
      { var r2 = _redistribute([0.6, 0.6], -1, 1); ok('A2 scale uniformly', eq(r2[0], 0.5) && eq(r2[1], 0.5)); ok('A2 sum==1', eq(r2[0] + r2[1], 1)); }
      { var r3 = _redistribute([0.2, 0.3, 0.4], 1, 0.6); ok('A3 pivot kept', eq(r3[1], 0.3)); ok('A3 others scaled', eq(r3[0], 0.1) && eq(r3[2], 0.2)); ok('A3 sum==0.6', eq(r3.reduce(function (s, a) { return s + a; }, 0), 0.6)); }
      { var r4 = _redistribute([0.2, 0.3, 0.4], 2, 1.0); ok('A4 pivot->1 others 0 (w/ AMP_MAX)', eq(r4[2], 1.0) || eq(r4[2], AMP_MAX)); }
      { var r5 = _redistribute([0.9, 0.05, 0.05], 0, 0.4); ok('A5 pivot>target -> pivot=target', eq(r5[0], 0.4)); ok('A5 others=0', eq(r5[1] + r5[2], 0)); }
      { var r6 = _redistribute([0.4, 0.4, 0.4], 99, 0.6); ok('A6 invalid pivot scales', eq(r6.reduce(function (s, a) { return s + a; }, 0), 0.6)); }
      { var a = [0.1, 0.2, 0.3]; var b = _redistribute(a, 0, 1.0); ok('B1 under cap unchanged', eq(b[0], 0.1) && eq(b[1], 0.2) && eq(b[2], 0.3)); }
      { var f0 = 440, n = 5; var fn = n * f0; ok('C1 harmonic partial frequency', eq(fn, n * f0)); }
      { ok('C2 count harmonics', _countHarmonicsPure(1000, 20000) === 20); }
      { var r7 = _redistribute([1], -1, 1.0); ok('D1 cap single partial', r7[0] <= AMP_MAX + 1e-9); }
      { var r8 = _allocByCoeffsPure([1, 1, 1], 1.0, 0.99); ok('E1 equal coeffs => equal amps', arrEq(r8, r8.map(function () { return r8[0]; }))); }
      { var coeffs = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5]; var r9 = _allocByCoeffsPure(coeffs, 1.0, 0.99); var r10 = _allocByCoeffsPure(coeffs, 1.0, 0.99); ok('E2 deterministic', arrEq(r9, r10)); }
      { var r11 = _allocByCoeffsPure([100, 1, 1, 1], 1.0, 0.2); ok('E3 cap + redistribute', r11[0] <= 0.2 + 1e-9 && Math.abs(r11.reduce(function (s, a) { return s + a; }, 0) - 1.0) < 1e-6); }
      { var rr = _allocByCoeffsPure([1, 1 / 2], 1.0, 0.99); ok('F1 saw 2 partials keeps ~2:1', Math.abs(rr[0] / rr[1] - 2) < 1e-6); }
      ok('G1 oddBase(1)=1', _oddBasePure(1) === 1);
      ok('G2 oddBase(2)=1', _oddBasePure(2) === 1);
      ok('G3 oddBase(3)=3', _oddBasePure(3) === 3);
      ok('G4 oddBase(4)=1', _oddBasePure(4) === 1);
      ok('G5 oddBase(6)=3', _oddBasePure(6) === 3);
      ok('G6 oddBase(9)=9', _oddBasePure(9) === 9);
      ok('G7 oddBase(12)=3', _oddBasePure(12) === 3);
      { var N1 = _countHarmonicsPure(6000, 20000); var fam1 = new Set(); for (var n1 = 1; n1 <= N1; n1++) { fam1.add(_oddBasePure(n1)); } ok('H1 families 6000 => {1,3}', fam1.has(1) && fam1.has(3) && fam1.size === 2); }
      { var N2 = _countHarmonicsPure(3500, 20000); var fam2 = new Set(); for (var n2 = 1; n2 <= N2; n2++) { fam2.add(_oddBasePure(n2)); } ok('H2 families 3500 => {1,3,5}', fam2.has(1) && fam2.has(3) && fam2.size === 3); }
      { var amps = [0.3, 0.2, 0.1, 0.05, 0.04]; var out = _groupToggleModel(amps, [0, 1, 3]); ok('I1 toggle restore', arrEq(amps, out)); }
      { var amps2 = [0.5, 0.4, 0.3]; var saved = new Map([[0, 0.25]]); var res = _muteWithSavedPure(amps2, saved, [0, 1]); ok('J1 saved[0] preserved', Math.abs(res.saved.get(0) - 0.25) < 1e-9); ok('J1 saved[1] created', Math.abs(res.saved.get(1) - 0.4) < 1e-9); ok('J1 out zeros', res.out[0] === 0 && res.out[1] === 0); }
      { var s = 'a\nb'; ok('K1 newline works', s.split('\n').length === 2); }
      // Spectrogram helpers
      {
        var map = buildRowToBin(200, 48000, 8192*2, 20);
        ok('S1 rowToBin length', map.length === 200);
        ok('S2 top>=bottom (high vs low)', map[0] >= map[199]);
      }

      document.getElementById('tests').textContent = log.join('\n');
    }

    (function init() {
      document.getElementById('freqSlider').value = hzToLin(Number(freqNum.value)).toFixed(4);
      buildBankUI(Number(freqNum.value));
      setMasterFromSum();
      runTests();
      updateButtons();
      updateGroupsToggleAllLabel();
      resizeAll();
    })();

    document.addEventListener('visibilitychange', function () { if (document.hidden) { stopEngine(); } });
  
