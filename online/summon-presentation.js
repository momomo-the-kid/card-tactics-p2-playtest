'use strict';

window.SummonEffects = (() => {
  const e11Impact = 115;
  const ring = (scene, color, options = {}) => {
    const { delay = 0, scale = 1.35, width = 100, height = 40, line = 2 } = options;
    scene.shape({
      width: width + 'px', height: height + 'px', border: line + 'px solid ' + color,
      borderRadius: '50%', boxShadow: '0 0 8px ' + color
    }, [
      { opacity: 0, transform: 'scale(.28)' },
      { opacity: .9, transform: 'scale(.59)', offset: .23 },
      { opacity: 0, transform: 'scale(' + scale + ')' }
    ], delay);
  };

  function motes(scene, type) {
    const colors = type === 'gather' ? ['#ddf8ff', '#9ed7ff', '#f2da8e'] : ['#ffd38c', '#ffac53', '#fff4bc'];
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const dx = Math.cos(angle) * (29 + i % 3 * 10);
      const dy = Math.sin(angle) * (21 + i % 4 * 5);
      const color = colors[i % colors.length];
      const start = type === 'gather' ? [dx, dy - 22] : [dx * .17, 1];
      const end = type === 'gather' ? [dx * .09, -16] : [dx, -25 - i % 5 * 10];
      const position = ([x, y], scale) => 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
      scene.shape({
        width: '4px', height: type === 'gather' ? '4px' : '8px', borderRadius: '3px',
        background: color, boxShadow: '0 0 7px ' + color
      }, [
        { opacity: 0, transform: position(start, .6) },
        { opacity: 1, offset: .25 },
        { opacity: 0, transform: position(end, .28) }
      ], i % 4 * 22, .86);
    }
  }

  const glow = (scene, background, width, height, top, transform = 'none') => {
    scene.shape({ background, width: width + 'px', height: height + 'px', top: top + 'px' }, [
      { opacity: 0, transform: 'scale(.74)' },
      { opacity: .76, transform, offset: .24 },
      { opacity: 0, transform: 'scale(1.13)' }
    ]);
  };

  function lightning(scene, { impact, color, width, paths }) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 192;
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    const ink = canvas.getContext('2d');
    ink.scale(2, 2);
    ink.lineCap = 'round';
    ink.lineJoin = 'round';
    for (const [index, points] of paths.entries()) {
      ink.beginPath();
      ink.moveTo(...points[0]);
      for (const point of points.slice(1)) ink.lineTo(...point);
      const weight = index ? width * .55 : width;
      ink.strokeStyle = color;
      ink.shadowColor = color;
      ink.shadowBlur = 10;
      ink.lineWidth = weight + 2;
      ink.stroke();
      ink.shadowBlur = 0;
      ink.strokeStyle = '#fff4fb';
      ink.lineWidth = weight;
      ink.stroke();
    }

    const bolt = scene.shape({ width: '128px', height: '96px', top: '-42px' });
    bolt.append(canvas);
    const hit = impact / scene.duration;
    scene.animate(bolt, [
      { opacity: .64, clipPath: 'inset(0 0 96% 0)' },
      { opacity: 1, clipPath: 'inset(0)', offset: hit },
      { opacity: .16, clipPath: 'inset(0)', offset: hit + .13 },
      { opacity: 0, clipPath: 'inset(0)', offset: hit + .27 },
      { opacity: 0, clipPath: 'inset(0)' }
    ], { duration: scene.duration, easing: 'linear' });
    scene.reveal([
      { opacity: 0 }, { opacity: 0, offset: hit },
      { opacity: 1, offset: hit + .055 }, { opacity: 1 }
    ], 'linear');
  }

  function lightningSparks(scene, impact, color) {
    for (const [x, y] of [[-24, -13], [-12, -28], [8, -21], [22, -13], [17, 4]]) {
      scene.shape({
        width: '3px', height: '5px', borderRadius: '50%',
        background: color, boxShadow: '0 0 6px ' + color
      }, [
        { opacity: 0, transform: 'scale(.75)' },
        { opacity: .85, offset: .08 },
        { opacity: 0, transform: 'translate(' + x + 'px,' + y + 'px) scale(.35)' }
      ], impact, .48);
    }
  }

  const choices = [
    ['光輪', '足元の輪がひとつ広がり、静かに消える。', 650, scene => {
      ring(scene, '#f7da89');
    }],
    ['光粒の収束', '小さな光粒が周囲から集まり、駒が現れる。', 850, scene => motes(scene, 'gather')],
    ['光柱', '細い光が足元から上へ伸びる。', 720, scene => {
      scene.shape({
        width: '44px', height: '90px', top: '-44px', transformOrigin: 'center bottom',
        background: 'radial-gradient(ellipse at center bottom, #adf9ffd9, #83d8ff52 48%, #83d8ff00 72%)',
        clipPath: 'polygon(25% 0, 75% 0, 100% 100%, 0 100%)'
      }, [
        { opacity: 0, transform: 'scaleY(.08)' },
        { opacity: .85, transform: 'scaleY(1)', offset: .32 },
        { opacity: 0, transform: 'scaleX(.62)' }
      ]);
    }],
    ['魔法陣', '足元に円とひし形が現れ、半回転してほどける。', 900, scene => {
      const symbol = scene.shape({
        width: '86px', height: '46px', border: '2px solid #bcabef',
        borderRadius: '50%', boxShadow: 'inset 0 0 9px #ba99ee80, 0 0 10px #ba99ee70'
      }, [
        { opacity: 0, transform: 'scale(.72) rotate(-14deg)' },
        { opacity: 1, offset: .29, transform: 'scale(1) rotate(0)' },
        { opacity: 0, transform: 'scale(1.17) rotate(16deg)' }
      ]);
      const diamond = document.createElement('span');
      diamond.className = 'rune';
      symbol.append(diamond);
      scene.animate(diamond, [{ transform: 'rotate(0)' }, { transform: 'rotate(180deg)' }], { duration: scene.duration });
    }],
    ['閃光の余韻', '一度だけ光り、淡い光が足元に残る。', 570, scene => {
      glow(scene, 'radial-gradient(ellipse, #fff5c4df, #ffc76766 39%, transparent 70%)', 104, 63, -12);
      scene.shape({
        width: '108px', height: '14px',
        background: 'radial-gradient(ellipse, #fff8c7dc, #ffd77466 39%, transparent 70%)'
      }, [
        { opacity: 0, transform: 'scaleX(.24)' },
        { opacity: .9, transform: 'scaleX(.75)', offset: .2 },
        { opacity: 0, transform: 'scaleX(1.12)' }
      ]);
    }],
    ['晴れる霧', '足元の霧が左右にほどけながら駒が現れる。', 880, scene => {
      for (const direction of [-1, 1]) {
        scene.shape({
          width: '77px', height: '37px', top: '-9px',
          background: 'radial-gradient(ellipse, #d3dce6b0, #a9bacd68 38%, transparent 72%)'
        }, [
          { opacity: 0, transform: 'scale(.68)' },
          { opacity: .9, offset: .26, transform: 'translateX(' + direction * 8 + 'px)' },
          { opacity: 0, transform: 'translate(' + direction * 49 + 'px,-11px) scale(1.25)' }
        ]);
      }
    }],
    ['舞い上がる火花', '足元から斜め上へ短い火花が走る。', 680, scene => motes(scene, 'rise')],
    ['二重の波紋', 'ずらした二つの波紋が足元から伝わる。', 770, scene => {
      ring(scene, '#8bddf1', { width: 102, height: 37 });
      ring(scene, '#a1c5ed', { delay: 170, width: 88, height: 33, line: 1 });
    }],
    ['輪郭の光', '盤面を照らさず、駒の輪郭だけが光る。', 640, scene => {
      scene.reveal([
        { opacity: .18, filter: 'drop-shadow(0 0 2px #b1eaff)' },
        { opacity: 1, filter: 'drop-shadow(0 0 6px #e5fbff) drop-shadow(0 0 12px #8fbdff)', offset: .32 },
        { opacity: 1, filter: 'drop-shadow(0 5px 4px #000b)' }
      ]);
    }],
    ['小さな着地', '駒だけが軽く跳ね、足元に短い衝撃が広がる。', 630, scene => {
      scene.reveal([
        { opacity: .15, transform: 'translateY(-17px)' },
        { opacity: 1, transform: 'translateY(1px) scale(1.04,.96)', offset: .38 },
        { transform: 'translateY(-4px)', offset: .58 },
        { transform: 'none' }
      ]);
      ring(scene, '#e7cba0', { delay: 210, width: 88, height: 27 });
    }],
    ['鋭い落雷', '細い稲妻が真上から落ち、足元の光と火花が素早く消える。', 690, scene => {
      const impact = e11Impact, color = '#8bdbff';
      lightning(scene, { impact, color, width: 1.5, paths: [
        [[63, 2], [52, 24], [67, 36], [58, 55], [68, 69], [64, 90]]
      ] });
      ring(scene, color, { delay: impact, width: 47, height: 16, line: 1, scale: 1 });
      lightningSparks(scene, impact, '#e8fbff');
    }],
    ['重い落雷', '太い一撃が落ち、着弾点から小さな衝撃波が広がる。', 820, scene => {
      const impact = 150, color = '#ffce82';
      lightning(scene, { impact, color, width: 4.5, paths: [
        [[72, 3], [55, 31], [70, 38], [48, 64], [61, 62], [64, 90]]
      ] });
      ring(scene, color, { delay: impact, width: 100, height: 28, scale: 1.18, line: 3 });
      scene.shape({
        width: '80px', height: '29px',
        background: 'radial-gradient(ellipse, #ffd99bba, transparent 69%)'
      }, [
        { opacity: 0, transform: 'scale(.55)' },
        { opacity: .8, offset: .08 },
        { opacity: 0, transform: 'scale(1.12)' }
      ], impact, .55);
    }],
    ['暗い魔雷', '紫の枝が着弾点に集まり、足元に短い放電が残る。', 860, scene => {
      const impact = 215, color = '#b171ff';
      lightning(scene, { impact, color, width: 2.5, paths: [
        [[60, 3], [70, 21], [56, 44], [72, 58], [64, 90]],
        [[25, 18], [37, 30], [29, 41], [43, 48], [56, 44]],
        [[112, 11], [96, 28], [103, 38], [87, 48], [92, 62], [71, 70], [64, 90]],
        [[18, 50], [32, 55], [35, 65], [54, 66], [64, 90]]
      ] });
      lightningSparks(scene, impact + 45, '#d799ff');
      ring(scene, '#9a64dd', { delay: impact, width: 65, height: 24, line: 1, scale: 1.13 });
    }]
  ].map(([name, summary, duration, draw], index) => ({
    id: 'E' + String(index + 1).padStart(2, '0'), name, summary, duration, draw
  }));

  function play(choice, unit, layer, reducedMotion) {
    const animations = [];
    const duration = reducedMotion ? 300 : choice.duration;
    const animate = (element, frames, timing) => {
      const animation = element.animate(frames, { easing: 'ease-out', fill: 'both', ...timing });
      animations.push(animation);
    };
    let revealed = false;
    const scene = {
      duration,
      animate,
      reveal(frames, easing = 'ease-out') {
        revealed = true;
        animate(unit, frames, { duration, easing });
      },
      shape(style, frames, delay = 0, fraction = 1) {
        const element = document.createElement('span');
        element.className = 'fx';
        Object.assign(element.style, style);
        layer.append(element);
        if (frames) animate(element, frames, { delay, duration: (duration - delay) * fraction });
        return element;
      }
    };
    if (reducedMotion) {
      scene.shape({
        width: '82px', height: '34px', border: '2px solid #f1cc78', borderRadius: '50%'
      }, [{ opacity: .8 }, { opacity: .8 }]);
    } else {
      choice.draw(scene);
      if (!revealed) {
        const revealAt = choice.id === 'E02' ? .52 : choice.id === 'E06' ? .38 : .24;
        scene.reveal([{ opacity: .12 }, { opacity: .12, offset: revealAt }, { opacity: 1, offset: revealAt + .18 }, { opacity: 1 }]);
      }
    }
    return {
      duration,
      stop() {
        for (const animation of animations) animation.cancel();
        layer.replaceChildren();
      }
    };
  }

  return { choices, play, e11Impact };
})();

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

'use strict';
// Only confirmed summons arrive here. The CPU and online adapters own revision checks.
globalThis.SummonPresentation=(()=>{
 const effects=globalThis.SummonEffects,sounds=globalThis.SummonSounds;
 const effect=effects.choices.find(e=>e.id==='E11'),sound=sounds.choices.find(s=>s.id==='S04');
 const storageKey='cardTacticsSummonSE';
 const voices=new Set(),effectsOnBoard=new Set(),listeners=new Set();
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 let enabled=true,volume=25,context,gain,buffer,layer;

 try{
  const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
  if(typeof saved?.enabled==='boolean')enabled=saved.enabled;
  if(Number.isInteger(saved?.volume)&&saved.volume>=0&&saved.volume<=100)volume=saved.volume;
 }catch{}
 function updateGain(){
  // Preserve each impact, but bound the combined peak even in a quick burst.
  if(gain)gain.gain.value=enabled?volume/100/Math.max(1,voices.size):0;
 }
 function disconnect(voice){
  voice.onended=null;voice.disconnect();voices.delete(voice);updateGain();
 }
 function stopSound(){
  for(const voice of voices){
   try{voice.stop();}catch{}
   disconnect(voice);
  }
 }
 function save(){
  const settings={enabled,volume};
  try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}
  updateGain();
  for(const listener of listeners)listener(settings);
 }
 function unlock(event){
  if(!event?.isTrusted||!enabled||!volume||document.visibilityState!=='visible')return;
  try{
   context=globalThis.CardTacticsBGM.getAudioContext();
   if(context&&context.state!=='running')context.resume().catch(()=>{});
  }catch{}
 }
 function impactSound(impactAt){
  if(!enabled||!volume||context?.state!=='running')return;
  let voice;
  try{
   if(!gain){gain=context.createGain();gain.connect(context.destination);}
   if(!buffer){
    const samples=sounds.mix(sound,context.sampleRate);
    buffer=context.createBuffer(1,samples.length,context.sampleRate);
    buffer.getChannelData(0).set(samples);
   }
   voice=context.createBufferSource();voice.buffer=buffer;voice.connect(gain);
   voice.onended=()=>disconnect(voice);
   voices.add(voice);updateGain();voice.start(context.currentTime+Math.max(0,impactAt-performance.now())/1000);
  }catch{if(voice)disconnect(voice);}
 }

 function position(){
  if(!effectsOnBoard.size)return;
  const board=document.getElementById('board'),pieceOverlay=document.getElementById('pieceOverlay');
  for(const entry of effectsOnBoard){
   const selector=`[data-cell="${entry.cell}"]`;
   const foot=board.querySelector(selector+' [data-plane-point="foot"]');
   if(!foot?.getClientRects().length)continue;
   const rect=foot.getBoundingClientRect();
   entry.node.style.left=rect.left+'px';
   entry.node.style.top=rect.top+'px';
   if(!entry.reveal)continue;
   const piece=pieceOverlay.querySelector(selector);
   const target=piece?.dataset.summonIdentity===entry.identity?piece:null;
   if(entry.reveal.effect.target!==target)entry.reveal.effect.target=target;
  }
 }
 function remove(entry){
  clearTimeout(entry.timer);entry.animation?.stop();entry.node.remove();effectsOnBoard.delete(entry);
 }
 function clear(){
  for(const entry of effectsOnBoard)remove(entry);
  stopSound();
 }
 function present(events,board){
  if(document.visibilityState!=='visible')return;
  for(const {type,token,side,cell,cardId} of events){
   if(type!=='creature:summoned'||token||!Number.isInteger(cell)||cell<0||cell>=25)continue;
   const piece=board[cell];
   const node=document.createElement('div');
   node.className='summonStrike';node.dataset.cell=cell;
   const entry={cell,node,identity:piece?.type===cardId&&piece.side===side?String(piece.sourceInstanceId):null};
   // Keep the sample's reveal timeline when the piece node is regenerated.
   const unit={animate(frames,timing){
    const reveal=new Animation(new KeyframeEffect(null,frames,timing),document.timeline);
    entry.reveal=reveal;reveal.play();return reveal;
   }};
   try{
    if(!layer){layer=document.createElement('div');layer.id='summonLayer';layer.setAttribute('aria-hidden','true');document.body.append(layer);}
    layer.append(node);
    const started=performance.now(),reduced=reduce.matches;
    entry.animation=effects.play(effect,unit,node,reduced);
    entry.timer=setTimeout(()=>remove(entry),entry.animation.duration);
    effectsOnBoard.add(entry);
    impactSound(started+(reduced?0:effects.e11Impact));
   }catch{remove(entry);}
  }
  position();
 }

 for(const event of ['pointerup','click','keydown'])document.addEventListener(event,unlock,true);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')clear();});
 document.addEventListener('p2b1:exit',clear);
 window.addEventListener('pagehide',clear);
 reduce.addEventListener('change',clear);
 return {
  present,position,clear,
  setEnabled(value,event){enabled=value===true;if(enabled)unlock(event);else stopSound();save();},
  setVolume(value,event){if(Number.isInteger(value)){volume=Math.max(0,Math.min(100,value));if(volume)unlock(event);else stopSound();save();}},
  subscribe(fn){listeners.add(fn);fn({enabled,volume});return ()=>listeners.delete(fn);}
 };
})();
