'use strict';

window.SummonEffects = (() => {
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
      reveal(frames) {
        revealed = true;
        animate(unit, frames, { duration });
      },
      shape(style, frames, delay = 0, fraction = 1) {
        const element = document.createElement('span');
        element.className = 'fx';
        Object.assign(element.style, style);
        layer.append(element);
        animate(element, frames, { delay, duration: (duration - delay) * fraction });
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

  return { choices, play };
})();
