'use strict';

window.ActionSounds = (() => {
  // Entries use the existing monophonic synthesizer and its peak and tail handling.
  const tone = (frequency, endFrequency, duration, gain, options = {}) => ({
    kind: 'tone', frequency, endFrequency, duration, gain, start: 0, attack: .008,
    decay: 3.4, partials: [[1, 1]], ...options
  });
  const noise = (low, high, duration, gain, options = {}) => ({
    kind: 'noise', low, high, duration, gain, start: 0, attack: .008, decay: 3.6, ...options
  });
  const catalog = (prefix, entries) => entries.map(([name, summary, voices], i) => ({
    id: prefix + String(i + 1).padStart(2, '0'), name, summary, voices,
    duration: Math.round(1000 * Math.max(...voices.map(v => v.start + v.duration)))
  }));

  const attack = catalog('H', [
    ['薄い斬撃', '細い風切りに短い刃音が重なる。', [
      noise(680, 4650, .18, .7, { attack: .047, sweep: -1 }),
      tone(950, 485, .115, .2, { start: .034, partials: [[1, 1], [1.56, .15]] })
    ]],
    ['軽い打撃', '小さく乾いた打点がすぐ収まる。', [
      tone(230, 108, .13, .43, { decay: 4.1, partials: [[1, 1], [2, .2]] }),
      noise(410, 2320, .12, .59, { decay: 3.1 })
    ]],
    ['重い打撃', '低い響きが短く沈み、打点がはっきりする。', [
      tone(149, 61, .26, .54, { attack: .013, partials: [[1, 1], [2, .31], [3, .12]] }),
      noise(85, 910, .21, .54, { start: .013, decay: 2.5 }),
      noise(840, 3200, .085, .2)
    ]],
    ['金属への命中', '短い金属音と控えめな余韻。', [
      tone(581, 554, .26, .28, { partials: [[1, 1], [2.71, .45], [3.64, .2]] }),
      tone(934, 885, .17, .12, { start: .011 }),
      noise(840, 4900, .1, .39)
    ]],
    ['短い風切り', '丸い風音が上がってから素早く引く。', [
      noise(310, 2900, .235, .74, { attack: .09, decay: 1.9, sweep: .78 }),
      tone(391, 268, .16, .12, { start: .05, attack: .047 })
    ]],
    ['木盾の打点', '木を叩くような中低音に小さな擦れ。', [
      tone(368, 301, .146, .39, { partials: [[1, 1], [1.92, .34], [2.9, .15]] }),
      tone(139, 95, .19, .22, { start: .009 }),
      noise(200, 1780, .138, .36)
    ]],
    ['二段の斬り込み', 'ひと息の間に短い切れ味が二段続く。', [
      noise(720, 4370, .12, .53, { attack: .035, sweep: -.59 }),
      noise(540, 3700, .139, .57, { start: .065, attack: .025, sweep: -.81 }),
      tone(580, 211, .12, .24, { start: .086 })
    ]],
    ['砂をはじく打撃', '中低音の打点に小さな粒の音が散る。', [
      tone(205, 103, .172, .48, { decay: 3.1 }),
      noise(480, 3780, .155, .48, { attack: .015, sweep: -.52 }),
      noise(1220, 4120, .12, .27, { start: .071, attack: .013 })
    ]],
    ['軽い残響の刃', '鈍い刃音に短い中音の響きが残る。', [
      noise(580, 3900, .142, .48, { attack: .032 }),
      tone(462, 293, .22, .28, { start: .016, partials: [[1, 1], [2.44, .22]] }),
      tone(371, 337, .16, .085, { start: .094 })
    ]],
    ['抑えた斬撃と打点', '細い空気音の直後に丸い打点。', [
      noise(460, 2910, .145, .55, { attack: .059, sweep: -.8 }),
      tone(238, 98, .167, .43, { start: .046, partials: [[1, 1], [2, .18]] }),
      noise(230, 1120, .102, .2, { start: .053 })
    ]]
  ]);

  const card = catalog('C', [
    ['カードを置く', '短い紙の擦れと、机に置くような打点。', [
      noise(680, 3400, .15, .58, { attack: .032, sweep: -.61 }),
      tone(280, 174, .1, .26, { start: .055 })
    ]],
    ['カードを払う', '乾いた擦れが手前から奥へ抜ける。', [
      noise(480, 2370, .211, .68, { attack: .072, decay: 2.2, sweep: .7 }),
      noise(950, 3750, .106, .26, { start: .08, attack: .026 })
    ]],
    ['柔らかい確定', '小さな二音で落ち着いて決まる。', [
      tone(370, 370, .174, .39, { attack: .017, decay: 4.1, partials: [[1, 1], [2, .13]] }),
      tone(494, 489, .193, .29, { start: .039, attack: .024, decay: 4.3 })
    ]],
    ['軽い発動', '中音からやや高い音へ短く開く。', [
      tone(470, 640, .205, .37, { attack: .032, decay: 4, partials: [[1, 1], [2, .15]] }),
      tone(742, 740, .224, .18, { start: .064, attack: .031, decay: 4.5 }),
      noise(520, 1570, .14, .17, { attack: .046 })
    ]],
    ['魔法の刻印', 'かすかな粒音が、小さく澄む一音にまとまる。', [
      noise(460, 1960, .16, .45, { attack: .072, sweep: .4 }),
      tone(552, 587, .23, .36, { start: .055, partials: [[1, 1], [2.82, .15]] }),
      tone(880, 876, .172, .14, { start: .116, attack: .019 })
    ]],
    ['暖かな発動', '明るい二音が柔らかく重なる。', [
      tone(330, 332, .294, .35, { attack: .053, decay: 2.6 }),
      tone(415, 415, .258, .25, { start: .051, attack: .035 }),
      tone(554, 554, .205, .16, { start: .086, attack: .043 })
    ]],
    ['印を押す', '抑えたクリックのあと、小さな丸い響き。', [
      noise(560, 2420, .111, .49, { decay: 3.3 }),
      tone(402, 309, .181, .35, { start: .011, attack: .019, partials: [[1, 1], [1.98, .13]] })
    ]],
    ['奥に沈む魔法', '低めの二音が静かに沈み、音の粒が少し残る。', [
      tone(281, 163, .332, .39, { attack: .055, decay: 2.4, partials: [[1, 1], [1.5, .24]] }),
      tone(347, 248, .256, .22, { start: .043, attack: .039 }),
      noise(260, 1230, .206, .18, { start: .089, attack: .059 })
    ]],
    ['小さな結晶', '遠すぎない中高音が短くきらめく。', [
      tone(746, 735, .211, .32, { attack: .018, partials: [[1, 1], [2.46, .28]] }),
      tone(993, 993, .137, .19, { start: .056, attack: .018 }),
      noise(630, 2190, .106, .18, { start: .021, attack: .024 })
    ]],
    ['紙音と確定', '軽いカード音に丸い確定音が続く。', [
      noise(580, 2910, .164, .51, { attack: .044, sweep: -.56 }),
      tone(437, 405, .21, .34, { start: .052, attack: .024, partials: [[1, 1], [2, .14]] }),
      tone(566, 548, .13, .11, { start: .097, attack: .039 })
    ]]
  ]);

  return { attack, card };
})();
