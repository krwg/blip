import { t } from '../i18n.js';
import {
  buildThemedSelect,
  fillSettingsDropdown,
  buildSettingsField,
  buildPanelTitleRow,
  createPixelToggle,
  createPixelHintIcon,
  buildSettingsFieldWithHint,
} from '../settings-ui.js';
import { buildMicTestPanel } from '../mic-test-panel.js';
import {
  STREAM_QUALITY_IDS,
  normalizeStreamQuality,
  normalizeFullscreenQuality,
} from '../call-media.js';
import { showAppToast } from '../toasts.js';

async function ensureAudioDeviceLabels() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((tr) => tr.stop());
  } catch {

  }
}

async function listMediaDevices(kind) {
  await ensureAudioDeviceLabels();
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === kind);
}

function fillDeviceSelect(select, devices, currentId, deviceLabelKey) {
  while (select.options.length > 1) select.remove(1);
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent =
      d.label || `${t(deviceLabelKey)} (${d.deviceId.slice(0, 8)}…)`;
    select.appendChild(opt);
  }
  const ok = [...select.options].some((o) => o.value === currentId);
  select.value = ok ? currentId : '';
}

/**
 * @param {{
 *   getState: () => { config: object },
 *   saveConfig: (patch: object) => Promise<object>,
 * }} deps
 */
export function buildSettingsCallPanel({ getState, saveConfig }) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel';
  frag.appendChild(buildPanelTitleRow('settings.section_call', 'settings.call_hint'));

  const micTest = buildMicTestPanel(state.config, async (patch) => {
    state.config = await saveConfig(patch);
    return state.config;
  });
  frag.appendChild(micTest.el);

  const qualitySelect = buildThemedSelect('blip-select settings-call-select');
  const qOpts = STREAM_QUALITY_IDS.map((id) => ({
    value: id,
    label: t(`settings.stream_quality_${id}`),
  }));
  fillSettingsDropdown(
    qualitySelect,
    qOpts,
    normalizeStreamQuality(state.config.streamQuality),
    async (val) => {
      state.config = await saveConfig({ streamQuality: val });
    }
  );
  frag.appendChild(buildSettingsField('settings.stream_quality', qualitySelect));

  const fsSelect = buildThemedSelect('blip-select settings-call-select');
  fillSettingsDropdown(
    fsSelect,
    qOpts,
    normalizeFullscreenQuality(state.config),
    async (val) => {
      state.config = await saveConfig({ fullscreenQuality: val });
    }
  );
  frag.appendChild(buildSettingsField('settings.fullscreen_quality', fsSelect));

  const micSelect = buildThemedSelect('blip-select settings-call-select');
  const micDefault = document.createElement('option');
  micDefault.value = '';
  micDefault.dataset.i18n = 'settings.call_mic_default';
  micDefault.textContent = t('settings.call_mic_default');
  micSelect.appendChild(micDefault);

  const outSelect = buildThemedSelect('blip-select settings-call-select');
  const outDefault = document.createElement('option');
  outDefault.value = '';
  outDefault.dataset.i18n = 'settings.call_speaker_default';
  outDefault.textContent = t('settings.call_speaker_default');
  outSelect.appendChild(outDefault);

  async function populateDevices() {
    const inputs = await listMediaDevices('audioinput');
    const outputs = await listMediaDevices('audiooutput');
    fillDeviceSelect(
      micSelect,
      inputs,
      state.config.audioInputDeviceId || '',
      'settings.call_mic_device'
    );
    fillDeviceSelect(
      outSelect,
      outputs,
      state.config.audioOutputDeviceId || '',
      'settings.call_speaker_device'
    );
  }

  micSelect.addEventListener('change', async () => {
    state.config = await saveConfig({ audioInputDeviceId: micSelect.value });
  });
  outSelect.addEventListener('change', async () => {
    state.config = await saveConfig({ audioOutputDeviceId: outSelect.value });
  });

  void populateDevices();

  const micTestWrap = document.createElement('div');
  micTestWrap.className = 'settings-mic-test';
  const micTestLabel = document.createElement('span');
  micTestLabel.className = 'settings-sub-label';
  micTestLabel.dataset.i18n = 'settings.call_mic_test_label';
  micTestLabel.textContent = t('settings.call_mic_test_label');

  const micTestActions = document.createElement('div');
  micTestActions.className = 'settings-mic-test-actions';

  const micTestBtn = document.createElement('button');
  micTestBtn.type = 'button';
  micTestBtn.className = 'btn btn-lang';
  micTestBtn.dataset.i18n = 'settings.call_mic_test';
  micTestBtn.textContent = t('settings.call_mic_test');

  const micTestStopBtn = document.createElement('button');
  micTestStopBtn.type = 'button';
  micTestStopBtn.className = 'btn btn-danger hidden';
  micTestStopBtn.dataset.i18n = 'settings.call_mic_test_stop';
  micTestStopBtn.textContent = t('settings.call_mic_test_stop');

  const micMeter = document.createElement('div');
  micMeter.className = 'settings-mic-meter hidden';
  for (let i = 0; i < 12; i++) {
    const bar = document.createElement('div');
    bar.className = 'settings-mic-bar';
    micMeter.appendChild(bar);
  }

  let micTestStream = null;
  let micTestRaf = 0;
  let micTestCtx = null;

  function stopMicTest() {
    if (micTestRaf) cancelAnimationFrame(micTestRaf);
    micTestRaf = 0;
    if (micTestStream) {
      micTestStream.getTracks().forEach((tr) => tr.stop());
      micTestStream = null;
    }
    if (micTestCtx) {
      void micTestCtx.close();
      micTestCtx = null;
    }
    micMeter.querySelectorAll('.settings-mic-bar').forEach((b) => b.classList.remove('lit'));
    micMeter.classList.add('hidden');
    micTestBtn.classList.remove('hidden');
    micTestStopBtn.classList.add('hidden');
  }

  micTestBtn.addEventListener('click', async () => {
    stopMicTest();
    const deviceId = micSelect.value;
    const audio =
      deviceId && deviceId !== 'default'
        ? { deviceId: { exact: deviceId } }
        : true;
    try {
      micTestStream = await navigator.mediaDevices.getUserMedia({ audio });
      micTestCtx = new AudioContext();
      const src = micTestCtx.createMediaStreamSource(micTestStream);
      const analyser = micTestCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const bins = new Uint8Array(analyser.frequencyBinCount);
      const bars = [...micMeter.querySelectorAll('.settings-mic-bar')];

      const tick = () => {
        analyser.getByteFrequencyData(bins);
        let sum = 0;
        for (let i = 0; i < bins.length; i++) sum += bins[i];
        const level = Math.min(1, sum / bins.length / 96);
        bars.forEach((bar, i) => {
          const threshold = (i + 1) / bars.length;
          bar.classList.toggle('lit', level >= threshold * 0.82);
        });
        micTestRaf = requestAnimationFrame(tick);
      };
      tick();
      micMeter.classList.remove('hidden');
      micTestBtn.classList.add('hidden');
      micTestStopBtn.classList.remove('hidden');
    } catch (err) {
      console.warn('[settings] mic test:', err.message);
      showAppToast({
        title: t('settings.call_mic_test_fail'),
        body: err?.message || '',
        durationMs: 4500,
        variant: 'danger',
      });
    }
  });

  micTestStopBtn.addEventListener('click', () => stopMicTest());
  micSelect.addEventListener('change', () => stopMicTest());

  micTestActions.appendChild(micTestBtn);
  micTestActions.appendChild(micTestStopBtn);
  micTestWrap.appendChild(micTestLabel);
  micTestWrap.appendChild(micTestActions);
  micTestWrap.appendChild(micMeter);

  frag.appendChild(buildSettingsField('settings.call_mic', micSelect));
  frag.appendChild(buildSettingsField('settings.call_speaker', outSelect));

  const pttToggle = createPixelToggle({
    checked: !!state.config.pushToTalkEnabled,
    labelKey: 'settings.push_to_talk',
    onChange: async (checked) => {
      state.config = await saveConfig({ pushToTalkEnabled: checked });
    },
  });
  const pttRow = document.createElement('div');
  pttRow.className = 'settings-toggle-with-hint';
  pttRow.appendChild(pttToggle.el);
  pttRow.appendChild(createPixelHintIcon('settings.push_to_talk_hint'));
  frag.appendChild(pttRow);

  const pttKeySelect = buildThemedSelect('blip-select settings-call-select');
  fillSettingsDropdown(
    pttKeySelect,
    [
      { value: 'v', label: 'V' },
      { value: 'b', label: 'B' },
      { value: 'f6', label: 'F6' },
      { value: 'f7', label: 'F7' },
    ],
    String(state.config.pushToTalkKey || 'v').toLowerCase(),
    async (val) => {
      state.config = await saveConfig({ pushToTalkKey: val });
    }
  );
  frag.appendChild(
    buildSettingsFieldWithHint('settings.push_to_talk_key', pttKeySelect, 'settings.push_to_talk_key_hint')
  );

  frag.appendChild(micTestWrap);
  return frag;
}
