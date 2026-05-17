import { t } from './i18n.js';
import { getVoiceMediaStream } from './audio-capture.js';

/**
 * Discord-style mic test: level meter, input gain slider, noise suppression toggle.
 * @param {object} config
 * @param {(patch: object) => Promise<object>} saveConfig
 */
export function buildMicTestPanel(config, saveConfig) {
  const wrap = document.createElement('div');
  wrap.className = 'mic-test-panel';

  const title = document.createElement('h3');
  title.className = 'section-subtitle';
  title.dataset.i18n = 'settings.mic_test_title';
  title.textContent = t('settings.mic_test_title');
  wrap.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.dataset.i18n = 'settings.mic_test_hint';
  hint.textContent = t('settings.mic_test_hint');
  wrap.appendChild(hint);

  const meter = document.createElement('div');
  meter.className = 'mic-test-meter';
  const meterFill = document.createElement('div');
  meterFill.className = 'mic-test-meter-fill';
  meter.appendChild(meterFill);
  wrap.appendChild(meter);

  const gainLabel = document.createElement('label');
  gainLabel.className = 'settings-field-label';
  gainLabel.dataset.i18n = 'settings.mic_input_volume';
  gainLabel.textContent = t('settings.mic_input_volume');
  const gainRow = document.createElement('div');
  gainRow.className = 'mic-test-slider-row';
  const gainSlider = document.createElement('input');
  gainSlider.type = 'range';
  gainSlider.min = '0';
  gainSlider.max = '200';
  gainSlider.value = String(config.micInputGain ?? 100);
  const gainVal = document.createElement('span');
  gainVal.className = 'mic-test-slider-val';
  gainVal.textContent = `${gainSlider.value}%`;
  gainRow.appendChild(gainSlider);
  gainRow.appendChild(gainVal);
  wrap.appendChild(gainLabel);
  wrap.appendChild(gainRow);

  const nsRow = document.createElement('label');
  nsRow.className = 'settings-tray-toggle-row';
  const nsCb = document.createElement('input');
  nsCb.type = 'checkbox';
  nsCb.checked = config.noiseSuppression !== false;
  const nsSpan = document.createElement('span');
  nsSpan.dataset.i18n = 'settings.noise_suppression';
  nsSpan.textContent = t('settings.noise_suppression');
  nsRow.appendChild(nsCb);
  nsRow.appendChild(nsSpan);
  wrap.appendChild(nsRow);

  const actions = document.createElement('div');
  actions.className = 'mic-test-actions';
  const testBtn = document.createElement('button');
  testBtn.type = 'button';
  testBtn.className = 'btn btn-accent';
  testBtn.dataset.i18n = 'settings.mic_test_start';
  testBtn.textContent = t('settings.mic_test_start');
  actions.appendChild(testBtn);
  wrap.appendChild(actions);

  let testStream = null;
  let testCtx = null;
  let testSrc = null;
  let testGain = null;
  let testDest = null;
  let meterRaf = null;
  let analyser = null;

  function stopTest() {
    if (meterRaf) cancelAnimationFrame(meterRaf);
    meterRaf = null;
    meterFill.style.width = '0%';
    testSrc?.disconnect();
    testGain?.disconnect();
    testDest?.disconnect();
    testStream?.getTracks().forEach((tr) => tr.stop());
    testStream = null;
    if (testCtx) {
      void testCtx.close().catch(() => {});
      testCtx = null;
    }
    testBtn.dataset.i18n = 'settings.mic_test_start';
    testBtn.textContent = t('settings.mic_test_start');
  }

  function tickMeter() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > peak) peak = data[i];
    }
    const pct = Math.min(100, Math.round((peak / 255) * 140));
    meterFill.style.width = `${pct}%`;
    meterRaf = requestAnimationFrame(tickMeter);
  }

  async function startTest() {
    stopTest();
    const live = {
      ...config,
      noiseSuppression: nsCb.checked,
      micInputGain: Number(gainSlider.value),
    };
    try {
      testStream = await getVoiceMediaStream(live);
      testCtx = new AudioContext();
      testSrc = testCtx.createMediaStreamSource(testStream);
      testGain = testCtx.createGain();
      testGain.gain.value = (Number(gainSlider.value) || 100) / 100;
      testDest = testCtx.createMediaStreamDestination();
      analyser = testCtx.createAnalyser();
      analyser.fftSize = 256;
      testSrc.connect(testGain);
      testGain.connect(analyser);
      testGain.connect(testDest);
      testGain.connect(testCtx.destination);
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.srcObject = testDest.stream;
      void audio.play().catch(() => {});
      meterRaf = requestAnimationFrame(tickMeter);
      testBtn.dataset.i18n = 'settings.mic_test_stop';
      testBtn.textContent = t('settings.mic_test_stop');
    } catch (err) {
      console.warn('[mic-test]', err?.message || err);
      stopTest();
    }
  }

  testBtn.addEventListener('click', () => {
    if (testStream) stopTest();
    else void startTest();
  });

  gainSlider.addEventListener('input', () => {
    gainVal.textContent = `${gainSlider.value}%`;
    if (testGain) testGain.gain.value = (Number(gainSlider.value) || 100) / 100;
    void saveConfig({ micInputGain: Number(gainSlider.value) });
  });

  nsCb.addEventListener('change', async () => {
    await saveConfig({ noiseSuppression: nsCb.checked });
    if (testStream) {
      stopTest();
      await startTest();
    }
  });

  return {
    el: wrap,
    destroy: () => stopTest(),
  };
}
