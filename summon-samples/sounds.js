'use strict';

window.SummonSounds = (() => {
  const tone = (frequency, endFrequency, duration, gain, options = {}) => ({
    kind: 'tone', frequency, endFrequency, duration, gain,
    start: 0, attack: .008, decay: 3.3, partials: [[1, 1]], ...options
  });
  const noise = (low, high, duration, gain, options = {}) => ({
    kind: 'noise', low, high, duration, gain, start: 0, attack: .009, decay: 4, ...options
  });
  const choices = [
    ['柔らかい魔法', '丸い音が二音重なり、柔らかくほどける。', [
      tone(310, 460, .52, .37, { attack: .036, partials: [[1, 1], [2, .16]] }),
      tone(515, 523, .65, .23, { start: .11, attack: .035, decay: 2.8 }),
      noise(430, 1760, .38, .1, { attack: .041 })
    ]],
    ['澄んだ結晶', '硬質な高音が二段に鳴り、結晶のように響く。', [
      tone(1080, 1080, .58, .36, { partials: [[1, .8], [2.37, .31], [3.84, .16]] }),
      tone(1550, 1510, .43, .25, { start: .073, partials: [[1, .8], [2.11, .25]] }),
      tone(1550, 1510, .35, .09, { start: .231 })
    ]],
    ['重い出現', '低い音程が沈み込み、重さのある余韻が残る。', [
      tone(139, 46, .7, .64, { attack: .014, decay: 2.6, partials: [[1, .87], [2, .37], [3, .16]] }),
      noise(48, 430, .41, .43, { start: .008, decay: 4.2 }),
      tone(318, 111, .15, .17, { start: .01 })
    ]],
    ['空気を切る音', '息のような立ち上がりに、短い風切り音が重なる。', [
      noise(510, 3200, .36, .97, { attack: .14, decay: 1.7, sweep: -1.25 }),
      noise(1200, 5400, .12, .21, { start: .145, attack: .012 }),
      tone(570, 250, .12, .09, { start: .145 })
    ]],
    ['光の上昇', '音程が上がる光の粒が最後の一音に集まる。', [
      ...[310, 391, 494, 622].map((f, i) =>
        tone(f * .88, f * 1.27, .26, .28, { start: i * .085, attack: .035, partials: [[1, 1], [2, .25]] })),
      tone(830, 830, .49, .18, { start: .32, attack: .038 })
    ]],
    ['落ち着いた着地', '乾いた接地と小さな砂音。余韻は控えめ。', [
      tone(180, 82, .25, .47, { decay: 4.5, partials: [[1, .9], [2, .29]] }),
      noise(190, 1700, .18, .5, { attack: .006 }),
      noise(730, 2700, .22, .19, { start: .062, attack: .025 })
    ]],
    ['金属の残響', '短い金属音に、異なる高さの響きが残る。', [
      tone(475, 451, .78, .3, { decay: 2.4, partials: [[1, .74], [2.72, .42], [3.92, .26], [5.1, .11]] }),
      noise(600, 3600, .12, .38),
      tone(668, 664, .52, .16, { start: .14, partials: [[1, .8], [1.49, .36], [2.6, .2]] })
    ]],
    ['暗い魔法', 'わずかに濁る低い音が下降し、影のような音が残る。', [
      tone(212, 108, .84, .41, { attack: .065, decay: 2.25, partials: [[1, .85], [1.51, .32], [2, .18]] }),
      tone(227, 102, .76, .28, { start: .044, attack: .06, decay: 2.5 }),
      noise(130, 910, .7, .25, { start: .07, attack: .11, sweep: -.55 })
    ]],
    ['温かな聖響', '柔らかな三和音に、高い余韻が静かに重なる。', [
      ...[262, 330, 392].map((f, i) =>
        tone(f, f, .93 - i * .035, [.35, .19, .22][i],
          { start: i * .031, attack: .085, decay: 2.8, partials: [[1, 1], [2, .13], [3, .08]] })),
      tone(784, 784, .68, .12, { start: .185, attack: .09 })
    ]],
    ['短い衝撃', '鋭いひと鳴りと短い低音で、素早く収まる。', [
      noise(410, 4700, .14, .63, { attack: .004, decay: 5.8 }),
      tone(230, 66, .22, .54, { attack: .005, decay: 4.2, partials: [[1, .85], [2.13, .24]] }),
      tone(780, 297, .068, .22, { attack: .004, decay: 5 })
    ]],
    ['鋭い電撃', '高い帯域の「バチッ」に、短く割れる電気音が続く。', [
      noise(900, 7500, .15, .77, { attack: .006, decay: 2.9, sweep: -.88 }),
      tone(1590, 610, .11, .22, { start: .009, attack: .007, partials: [[1, .86], [2.48, .29]] }),
      noise(550, 4600, .11, .4, { start: .04, attack: .007, decay: 3.8 }),
      noise(780, 6200, .105, .32, { start: .085, attack: .008, decay: 4.4 })
    ]],
    ['雷撃と低い雷鳴', '硬い着弾の下に、短く沈み込む雷鳴が重なる。', [
      noise(210, 5400, .15, .49, { attack: .007, decay: 3.9, sweep: -.78 }),
      tone(166, 48, .48, .53, { start: .009, attack: .014, decay: 3, partials: [[1, .87], [2, .33], [3, .14]] }),
      noise(40, 315, .54, .72, { start: .04, attack: .05, decay: 2.8, sweep: -.57 })
    ]],
    ['魔法的な雷', '割れる電撃が、少し濁った暗い残響に変わる。', [
      noise(510, 5780, .16, .59, { attack: .01, decay: 3.9, sweep: -.64 }),
      tone(930, 224, .18, .2, { start: .018, attack: .009, partials: [[1, 1], [2.17, .29]] }),
      noise(880, 4200, .17, .31, { start: .075, attack: .012, decay: 4.1 }),
      tone(221, 112, .69, .49, { start: .034, attack: .047, decay: 2.65, partials: [[1, .86], [1.49, .39], [2.02, .15]] }),
      tone(231, 104, .54, .28, { start: .122, attack: .058, decay: 2.65 })
    ]]
  ].map(([name, summary, voices], index) => ({
    id: 'S' + String(index + 1).padStart(2, '0'), name, summary, voices,
    duration: Math.round(1000 * Math.max(...voices.map(voice => voice.start + voice.duration)))
  }));

  function mix(choice, rate) {
    const length = Math.ceil(choice.duration * rate / 1_000);
    const samples = new Float32Array(length);
    let seed = 14121 + Number(choice.id.slice(1)) * 101;
    const white = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2147483648 - 1;
    };
    const turn = 2 * Math.PI;
    for (const voice of choice.voices) {
      const offset = Math.round(voice.start * rate), size = Math.round(voice.duration * rate);
      let phase = 0, slow = 0, fast = 0;
      for (let i = 0; i < size && offset + i < length; i++) {
        const time = i / rate, progress = time / voice.duration;
        const envelope = Math.min(1, time / voice.attack) * Math.exp(-voice.decay * progress)
          * Math.min(1, (voice.duration - time) / .032);
        let value = 0;
        if (voice.kind === 'tone') {
          const frequency = voice.frequency * Math.pow(voice.endFrequency / voice.frequency, progress);
          phase += turn * frequency / rate;
          for (const [ratio, gain] of voice.partials) value += Math.sin(phase * ratio) * gain;
        } else {
          const input = white(), sweep = Math.pow(2, (voice.sweep || 0) * progress);
          slow += (1 - Math.exp(-turn * voice.low * sweep / rate)) * (input - slow);
          fast += (1 - Math.exp(-turn * voice.high * sweep / rate)) * (input - fast);
          value = fast - slow;
        }
        samples[offset + i] += value * envelope * voice.gain;
      }
    }
    let peak = 0;
    for (const value of samples) peak = Math.max(peak, Math.abs(value));
    if (peak > 0) {
      const gain = .56 / peak;
      for (let i = 0; i < samples.length; i++) samples[i] *= gain;
    }
    return samples;
  }

  return { choices, mix };
})();
