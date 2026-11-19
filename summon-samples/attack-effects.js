'use strict';

window.AttackEffects = (() => {
  function slash(scene, angle, width, color, delay = 0) {
    scene.shape('attackSlash', [
      { opacity: 0, transform: `rotate(${angle}deg) scaleX(.22)` },
      { opacity: .95, transform: `rotate(${angle}deg) scaleX(1)`, offset: .27 },
      { opacity: 0, transform: `rotate(${angle}deg) scaleX(1.12)` }
    ], { style: { width: width + 'px', color }, delay });
  }

  function ring(scene, color, width = 60) {
    scene.shape('attackRing', [
      { opacity: .1, transform: 'scale(.37)' },
      { opacity: .87, transform: 'scale(.65)', offset: .19 },
      { opacity: 0, transform: 'scale(1.14)' }
    ], { style: { width: width + 'px', color } });
  }

  function sparks(scene, color, spread) {
    for (const [index, angle] of [-152, -120, -74, -30, 22, 144].entries()) {
      const rad = angle * Math.PI / 180;
      const travel = `translate(${Math.cos(rad) * spread}px,${Math.sin(rad) * spread}px) rotate(${angle}deg)`;
      scene.shape('attackSpark', [
        { opacity: 0, transform: `rotate(${angle}deg) scale(.6)` },
        { opacity: 1, offset: .18 },
        { opacity: 0, transform: travel + ' scale(.3)' }
      ], { style: { color }, delay: index % 3 * 16 });
    }
  }

  const choices = [
    ['現行の命中表示', '現行の✴️が一度拡大して薄れる。比較基準。', 710, scene => {
      scene.shape('attackBaseline', [
        { opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1.25)', offset: .25 },
        { opacity: 0, transform: 'scale(1.5)' }
      ], { text: '✴️' });
    }],
    ['短い斬撃線', '細い線が斜めに一度走る。', 270, scene => slash(scene, -33, 68, '#e5f6ff')],
    ['交差する斬撃', '短い間隔で二本の線が対象を横切る。', 365, scene => {
      slash(scene, -38, 64, '#ecf5ff');
      slash(scene, 38, 59, '#b9defe', 52);
    }],
    ['弧を描く斬撃', '細い弧が手前から対象をすくうように走る。', 365, scene => {
      scene.shape('attackArc', [
        { opacity: 0, transform: 'rotate(-87deg) scale(.63)' },
        { opacity: .96, transform: 'rotate(-34deg)', offset: .31 },
        { opacity: 0, transform: 'rotate(8deg) scale(1.07)' }
      ]);
    }],
    ['鋭い命中光', '対象の中央だけに小さな四差光が一瞬出る。', 260, scene => {
      scene.shape('attackFlash', [
        { opacity: 0, transform: 'scale(.34)' },
        { opacity: .92, transform: 'scale(.95)', offset: .19 },
        { opacity: 0, transform: 'scale(.78)' }
      ]);
    }],
    ['打撃の衝撃波', '打点を中心に足元へ低い輪が広がる。', 390, scene => ring(scene, '#f5d396')],
    ['散る火花', '打点から斜めに小さな火花が飛ぶ。', 365, scene => sparks(scene, '#ffbf69', 38)],
    ['風圧', '対象の手前から奥へ半透明の風が抜ける。', 365, scene => {
      scene.shape('attackGust', [
        { opacity: 0, transform: 'translate(-19px,13px) rotate(-24deg) scale(.6)' },
        { opacity: .82, transform: 'rotate(-24deg)', offset: .38 },
        { opacity: 0, transform: 'translate(18px,-12px) rotate(-24deg) scale(1.2)' }
      ]);
    }],
    ['輪郭の発光', '対象の画像の輪郭に短い光が走る。', 390, scene => {
      scene.animate(scene.target, [
        { filter: 'drop-shadow(0 4px 3px #000b)' },
        { filter: 'drop-shadow(0 0 6px #ffdea0) drop-shadow(0 0 4px #fff2bb)', offset: .26 },
        { filter: 'drop-shadow(0 4px 3px #000b)' }
      ]);
    }],
    ['局所の揺れと衝撃', '命中した駒だけが数px揺れ、足元の輪が消える。', 380, scene => {
      scene.animate(scene.target, [
        { transform: 'none' }, { transform: 'translateX(4px)', offset: .16 },
        { transform: 'translateX(-3px)', offset: .36 }, { transform: 'translateX(1px)', offset: .57 },
        { transform: 'none' }
      ]);
      ring(scene, '#ffe0a1', 48);
    }],
    ['斬撃と火花', '薄い短線に小さな火花を重ねる。', 350, scene => {
      slash(scene, -24, 51, '#fff0b8');
      sparks(scene, '#ffd589', 27);
    }]
  ].map(([name, summary, duration, draw], index) => ({
    id: 'A' + String(index).padStart(2, '0'), name, summary, duration, draw
  }));

  function play(choice, target, layer, reducedMotion, damage) {
    const animations = [];
    const duration = reducedMotion ? 200 : choice.duration;
    const animate = (element, frames, timing = {}) => animations.push(element.animate(frames, {
      duration, easing: 'ease-out', fill: 'both', ...timing
    }));
    const shape = (className, frames, options = {}) => {
      const { style = {}, delay = 0, text = '' } = options;
      const shape = document.createElement('span');
      shape.className = 'attackShape ' + className;
      shape.textContent = text;
      Object.assign(shape.style, style);
      layer.append(shape);
      animate(shape, frames, { delay, duration: duration - delay });
    };
    if (reducedMotion) shape('attackRing', [{ opacity: .8 }, { opacity: .8 }], { style: { color: '#f2d097' } });
    else choice.draw({ target, animate, shape });

    if (damage) {
      const number = document.createElement('span');
      number.className = 'sampleDamage';
      number.textContent = '4';
      layer.append(number);
      const frames = reducedMotion ? [{ opacity: 1 }, { opacity: 1 }] : [
        { opacity: 1, transform: 'scale(.82)' },
        { opacity: 1, transform: 'scale(1.18)', offset: .14 },
        { opacity: 1, transform: 'scale(1)', offset: .28 },
        { opacity: 1, transform: 'scale(1)', offset: .6 },
        { opacity: 0, transform: 'translateY(-15%)' }
      ];
      animate(number, frames, { duration: 800 });
    }
    return {
      duration: damage ? 800 : duration,
      stop() { for (const animation of animations) animation.cancel(); layer.replaceChildren(); }
    };
  }
  return { choices, play };
})();
