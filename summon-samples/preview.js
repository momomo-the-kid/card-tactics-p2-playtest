'use strict';

(() => {
  const get = id => document.getElementById(id);
  const category = get('category'), effectSelect = get('effect'), soundSelect = get('sound');
  const volume = get('volume'), mute = get('mute'), gentle = get('gentle'), status = get('status');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const modes = {
    summon: { label: '召喚', effects: SummonEffects.choices, sounds: SummonSounds.choices, preview: '比較用の駒 · 金級兵' },
    attack: { label: '通常攻撃', effects: AttackEffects.choices, sounds: ActionSounds.attack, preview: '金級兵 → 歩兵' },
    card: { label: 'カード使用', effects: [], sounds: ActionSounds.card, preview: 'カード使用SEの試演' }
  };
  const selections = new Map();
  const buffers = new Map();
  let context, master, source, visual, visualTimer, timer, playback = 0, selectedCategory;

  get('board').append(...Array.from({ length: 25 }, () => document.createElement('span')));

  function selectCategory() {
    stop();
    if (selectedCategory) selections.set(selectedCategory, { effect: effectSelect.value, sound: soundSelect.value });
    selectedCategory = category.value;
    const mode = modes[selectedCategory], previous = selections.get(selectedCategory);
    for (const [kind, select, items] of [['effect', effectSelect, mode.effects], ['sound', soundSelect, mode.sounds]]) {
      select.replaceChildren(...items.map(item => new Option(item.id + '  ' + item.name, item.id)));
      if (previous?.[kind]) select.value = previous[kind];
    }
    for (const key of Object.keys(modes)) get(key + 'Scene').hidden = key !== selectedCategory;
    get('effectChoice').hidden = !mode.effects.length;
    get('damageChoice').hidden = selectedCategory !== 'attack';
    get('reference').hidden = selectedCategory !== 'summon';
    for (const button of document.querySelectorAll('[data-play="effect"],[data-play="both"]')) button.hidden = !mode.effects.length;
    get('effectLabel').textContent = mode.label + 'エフェクト';
    get('soundLabel').textContent = mode.label + 'SE';
    get('stageLabel').textContent = mode.preview;
    updateChoices();
    status.textContent = '再生ボタンを押すと試せます。';
  }

  function updateChoices() {
    const mode = modes[selectedCategory];
    const effect = mode.effects[effectSelect.selectedIndex], sound = mode.sounds[soundSelect.selectedIndex];
    const reducedDuration = selectedCategory === 'attack' ? 200 : 300;
    get('effectInfo').textContent = effect ? effect.id + ' · ' + effect.duration + 'ms — ' + effect.summary
      + (gentle.checked ? '（軽減時 ' + reducedDuration + 'ms）' : '') : '';
    get('soundInfo').textContent = sound.id + ' · ' + sound.duration + 'ms — ' + sound.summary;
  }

  function updateVolume() {
    const level = Number(volume.value) / 100;
    get('level').value = volume.value + '%';
    if (master) master.gain.setTargetAtTime(mute.checked ? 0 : level * level, context.currentTime, .008);
  }

  function stop() {
    playback++;
    clearTimeout(timer);
    clearTimeout(visualTimer);
    if (source) {
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect();
      source = null;
    }
    if (visual) {
      visual.stop();
      visual = null;
    }
  }

  function audioContext() {
    if (!context || context.state === 'closed') {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Web Audio unavailable');
      context = new Audio();
      master = context.createGain();
      master.connect(context.destination);
      buffers.clear();
      master.gain.value = Number(volume.value) ** 2 / 10_000;
    }
    return context;
  }

  function playSound(choice) {
    let buffer = buffers.get(choice.id);
    if (!buffer) {
      const samples = SummonSounds.mix(choice, context.sampleRate);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      buffers.set(choice.id, buffer);
    }
    const next = context.createBufferSource();
    next.buffer = buffer;
    next.connect(master);
    next.onended = () => {
      next.disconnect();
      if (source === next) source = null;
    };
    next.start();
    source = next;
  }

  async function play(mode) {
    stop();
    const token = playback;
    const items = modes[selectedCategory];
    const effect = items.effects[effectSelect.selectedIndex], sound = items.sounds[soundSelect.selectedIndex];
    const showEffect = mode !== 'sound' && effect, wantsSound = mode !== 'effect';
    let audioNote = '';
    let audioDuration = 0;

    if (wantsSound && !mute.checked && Number(volume.value) > 0) {
      try {
        const audio = audioContext();
        // Resume directly within the tap. No network or timer precedes it.
        if (audio.state !== 'running') await audio.resume();
        if (token !== playback) return;
        updateVolume();
        playSound(sound);
        audioDuration = sound.duration;
      } catch {
        if (token !== playback) return;
        audioNote = ' · 音声を開始できませんでした。再生ボタンを押し直してください。';
      }
    } else if (wantsSound) {
      audioNote = ' · ' + (mute.checked ? 'ミュート中' : '音量 0%');
    }

    let effectDuration = 0;
    if (showEffect) {
      visual = selectedCategory === 'attack'
        ? AttackEffects.play(effect, get('target'), get('attackImpact'), gentle.checked, get('damage').checked)
        : SummonEffects.play(effect, get('unit'), get('effects'), gentle.checked);
      effectDuration = visual.duration;
      visualTimer = setTimeout(() => {
        visual.stop();
        visual = null;
      }, effectDuration);
    }
    const label = [showEffect && effect.id, wantsSound && sound.id].filter(Boolean).join(' ＋ ');
    status.textContent = label + (audioDuration || effectDuration ? ' を再生' : '') + audioNote;
    timer = setTimeout(() => {
      stop();
      if (!audioNote) status.textContent = label + ' の再生完了';
    }, Math.max(audioDuration, effectDuration));
  }

  for (const button of document.querySelectorAll('[data-play]')) {
    button.addEventListener('click', () => play(button.dataset.play));
  }
  category.addEventListener('change', selectCategory);
  for (const select of [effectSelect, soundSelect, get('damage')]) select.addEventListener('change', () => {
    stop();
    updateChoices();
    status.textContent = '再生ボタンを押すと試せます。';
  });
  get('stop').addEventListener('click', () => {
    stop();
    status.textContent = '停止しました。';
  });
  get('reference')?.addEventListener('click', () => {
    stop();
    effectSelect.value = 'E10';
    soundSelect.value = 'S08';
    updateChoices();
    status.textContent = 'E10 ＋ S08 を選択しました。';
  });
  volume.addEventListener('input', updateVolume);
  mute.addEventListener('change', updateVolume);
  const motionChanged = () => {
    stop();
    updateChoices();
    status.textContent = '再生ボタンを押すと試せます。';
  };
  gentle.checked = reduceMotion.matches;
  gentle.addEventListener('change', motionChanged);
  const syncMotion = event => { gentle.checked = event.matches; motionChanged(); };
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', syncMotion);
  else reduceMotion.addListener(syncMotion);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stop();
      status.textContent = '再生ボタンを押すと試せます。';
    }
  });
  window.addEventListener('pagehide', stop);
  selectCategory();
  updateVolume();
})();
