import React, { useEffect, useRef, useState } from 'react';
import { PieceTile } from '../components/PieceTile';
import type { RankId } from '../engine/types';

interface HowToPlayPageProps {
  onBack: () => void;
}

type LessonTab = 'move' | 'clash' | 'win';

interface ClashScenario {
  label: string;
  atk: RankId;
  def: RankId;
  win: 'atk' | 'def' | 'both';
  title: string;
  desc: string;
  accent?: string;
}

const MOVE_STEPS: Array<{
  r: number;
  c: number;
  dots: Array<[number, number]>;
  bad: [number, number] | null;
  msg: string;
}> = [
  {
    r: 2,
    c: 2,
    dots: [
      [1, 2],
      [3, 2],
      [2, 1],
      [2, 3],
    ],
    bad: null,
    msg: 'ORTHOGONAL: 1 SQUARE UP, DOWN, LEFT, OR RIGHT',
  },
  { r: 1, c: 2, dots: [], bad: null, msg: '✓ SLIDES SMOOTHLY 1 SQUARE FORWARD!' },
  { r: 2, c: 2, dots: [], bad: [1, 1], msg: '✕ DIAGONAL MOVES ARE ILLEGAL!' },
  { r: 2, c: 3, dots: [], bad: null, msg: '✓ SLIDES SMOOTHLY 1 SQUARE RIGHT!' },
];

const CLASHES: ClashScenario[] = [
  {
    label: '5★ GEN vs COLONEL',
    atk: '5-star',
    def: 'colonel',
    win: 'atk',
    title: '5★ GENERAL WINS!',
    desc: 'Higher rank eliminates lower rank. (5★ > Colonel)',
  },
  {
    label: 'MAJOR vs MAJOR',
    atk: 'major',
    def: 'major',
    win: 'both',
    title: 'BOTH ELIMINATED!',
    desc: 'Equal ranks destroy each other. Both leave the board!',
  },
  {
    label: 'SPY vs 5★ GEN',
    atk: 'spy',
    def: '5-star',
    win: 'atk',
    title: 'SPY WINS!',
    desc: 'Spy eliminates ANY officer from 5★ General down to Sergeant!',
    accent: 'bg-[#d9843b] text-[#0f0d13]',
  },
  {
    label: 'PRIVATE vs SPY',
    atk: 'private',
    def: 'spy',
    win: 'atk',
    title: 'PRIVATE WINS!',
    desc: 'Only the Private can eliminate the Spy!',
    accent: 'bg-[#6ee74b] text-[#0f0d13]',
  },
  {
    label: 'ANY PIECE (OR FLAG) vs ENEMY FLAG',
    atk: 'private',
    def: 'flag',
    win: 'atk',
    title: 'FLAG CAPTURED — YOU WIN!',
    desc: 'Any piece (including your Flag) eliminates the enemy Flag!',
  },
];

const WIN_ROWS = [4, 3, 2, 1, 0];

export const HowToPlayPage: React.FC<HowToPlayPageProps> = ({ onBack }) => {
  const [tab, setTab] = useState<LessonTab>('move');
  const [moveIdx, setMoveIdx] = useState(0);
  const [winIdx, setWinIdx] = useState(0);

  // Clash animation state
  const [clashIdx, setClashIdx] = useState(2);
  const [clashPhase, setClashPhase] = useState<'ready' | 'slide' | 'impact' | 'done'>('done');
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMoveIdx((i) => (i + 1) % MOVE_STEPS.length);
    }, 1400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setWinIdx((i) => (i + 1) % WIN_ROWS.length);
    }, 950);
    return () => window.clearInterval(id);
  }, []);

  const triggerClash = (idx: number) => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    setClashIdx(idx);
    setClashPhase('ready');

    timersRef.current.push(
      window.setTimeout(() => setClashPhase('slide'), 60),
      window.setTimeout(() => setClashPhase('impact'), 420),
      window.setTimeout(() => setClashPhase('done'), 850),
    );
  };

  useEffect(() => {
    if (tab === 'clash') {
      triggerClash(2);
    }
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    };
  }, [tab]);

  const moveStep = MOVE_STEPS[moveIdx];
  const winRow = WIN_ROWS[winIdx];
  const clash = CLASHES[clashIdx];

  const atkCol = clashPhase === 'ready' ? 1 : 3;
  const showAtk =
    clashPhase === 'ready' ||
    clashPhase === 'slide' ||
    ((clashPhase === 'impact' || clashPhase === 'done') && clash.win === 'atk');
  const showDef =
    clashPhase === 'ready' ||
    clashPhase === 'slide' ||
    ((clashPhase === 'impact' || clashPhase === 'done') && clash.win === 'def');

  return (
    <div className="min-h-[100dvh] bg-[#1e1a24] text-[#f5f5f4] p-4">
      <div className="max-w-[440px] mx-auto space-y-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 pixel-btn bg-[#d9843b] flex items-center justify-center text-[#0f0d13] font-black text-lg">
              ?
            </div>
            <div>
              <h1 className="text-base font-black uppercase">How To Play</h1>
              <p className="text-xs text-[#a8a29e]">8-BIT FIELD MANUAL</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="pixel-btn px-3 py-1.5 bg-[#3a3244] text-xs font-bold uppercase cursor-pointer"
          >
            ← LOBBY
          </button>
        </div>

        {/* Lesson Tabs */}
        <div className="grid grid-cols-3 gap-2">
          {(['move', 'clash', 'win'] as const).map((k, i) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`pixel-btn py-2 text-xs font-black uppercase cursor-pointer ${
                tab === k ? 'bg-[#6ee74b] text-[#0f0d13]' : 'bg-[#3a3244] text-[#f5f5f4]'
              }`}
            >
              {i + 1}. {k === 'move' ? 'MOVE' : k === 'clash' ? 'BATTLE' : 'WIN'}
            </button>
          ))}
        </div>

        {/* LESSON 1: MOVEMENT */}
        {tab === 'move' && (
          <div className="pixel-panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase text-[#6ee74b]">Orthogonal Movement</h2>
              <span className="text-xs text-[#a8a29e]">SMOOTH SLIDE</span>
            </div>
            <p className="text-xs text-[#d6d3d1] leading-relaxed">
              Move <strong>1 piece per turn</strong> by <strong>1 square</strong>: Forward, Backward,
              Left, or Right.{' '}
              <span className="text-[#e04f4f] font-bold">Diagonal moves are illegal!</span>
            </p>
            <div className="pixel-board-wood w-[260px] mx-auto shrink-0">
              <div className="relative aspect-square w-full border-2 border-[#382e3b] overflow-hidden">
                <div className="grid grid-cols-5 grid-rows-5 w-full h-full">
                  {Array.from({ length: 25 }, (_, i) => {
                    const r = Math.floor(i / 5);
                    const c = i % 5;
                    const isDot = moveStep.dots.some(([dr, dc]) => dr === r && dc === c);
                    const isBad = moveStep.bad && moveStep.bad[0] === r && moveStep.bad[1] === c;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`flex items-center justify-center ${
                          (r + c) % 2 === 0 ? 'pixel-sq-light' : 'pixel-sq-dark'
                        }`}
                      >
                        {isDot && (
                          <span className="w-3.5 h-3.5 rounded-full bg-[#6ee74b] border-2 border-[#0f0d13]" />
                        )}
                        {isBad && <span className="text-base font-black text-[#dc2626]">✕</span>}
                      </div>
                    );
                  })}
                </div>
                <div
                  className="absolute top-0 left-0 w-[20%] h-[20%] flex items-center justify-center pointer-events-none"
                  style={{
                    transform: `translate3d(${moveStep.c * 100}%, ${moveStep.r * 100}%, 0)`,
                    transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <PieceTile rank="captain" side="white" />
                </div>
              </div>
            </div>
            <div className="bg-[#16131b] border-2 border-[#0f0d13] p-2.5 text-center text-xs font-bold text-[#c2d6cc]">
              {moveStep.msg}
            </div>
          </div>
        )}

        {/* LESSON 2: CHALLENGES */}
        {tab === 'clash' && (
          <div className="space-y-4">
            <div className="pixel-panel p-4 space-y-3">
              <h2 className="text-sm font-black uppercase text-[#6ee74b]">
                Who Kills Whom? (Challenges)
              </h2>
              <p className="text-xs text-[#d6d3d1]">
                Tap any matchup below to watch the smooth attack &amp; Arbiter result:
              </p>

              <div className="grid grid-cols-2 gap-2">
                {CLASHES.map((item, idx) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => triggerClash(idx)}
                    className={`pixel-btn p-2 text-xs font-black text-left cursor-pointer ${
                      idx === 4 ? 'col-span-2' : ''
                    } ${item.accent ?? 'bg-[#3a3244] text-[#f5f5f4]'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Strictly Square 5x5 Clash Board */}
              <div className="pixel-board-wood w-[260px] mx-auto shrink-0">
                <div className="relative aspect-square w-full border-2 border-[#382e3b] overflow-hidden">
                  <div className="grid grid-cols-5 grid-rows-5 w-full h-full">
                    {Array.from({ length: 25 }, (_, i) => {
                      const r = Math.floor(i / 5);
                      const c = i % 5;
                      const isThreatSq =
                        r === 2 && c === 3 && (clashPhase === 'ready' || clashPhase === 'slide');
                      return (
                        <div
                          key={`${r}-${c}`}
                          className={`flex items-center justify-center ${
                            isThreatSq
                              ? 'pixel-sq-threat'
                              : (r + c) % 2 === 0
                                ? 'pixel-sq-light'
                                : 'pixel-sq-dark'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Attacker (White) */}
                  <div
                    className="absolute top-0 left-0 w-[20%] h-[20%] flex items-center justify-center pointer-events-none"
                    style={{
                      transform: `translate3d(${atkCol * 100}%, 200%, 0)`,
                      opacity: showAtk ? 1 : 0,
                      transition:
                        clashPhase === 'ready'
                          ? 'none'
                          : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
                    }}
                  >
                    <PieceTile rank={clash.atk} side="white" />
                  </div>

                  {/* Defender (Black) */}
                  <div
                    className="absolute top-0 left-0 w-[20%] h-[20%] flex items-center justify-center pointer-events-none"
                    style={{
                      transform: 'translate3d(300%, 200%, 0)',
                      opacity: showDef ? 1 : 0,
                      transition: 'opacity 200ms ease',
                    }}
                  >
                    <PieceTile rank={clash.def} side="black" />
                  </div>

                  {/* Clash Flash */}
                  {clashPhase === 'impact' && (
                    <div
                      className="absolute top-0 left-0 w-[20%] h-[20%] flex items-center justify-center pointer-events-none text-2xl"
                      style={{ transform: 'translate3d(300%, 200%, 0)' }}
                    >
                      ⚔️
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#16131b] border-2 border-[#0f0d13] p-3 text-center space-y-1">
                {clashPhase === 'ready' || clashPhase === 'slide' ? (
                  <>
                    <p className="text-xs font-black text-[#d9843b] uppercase">CHALLENGING...</p>
                    <p className="text-xs text-[#a8a29e]">Gliding into opponent&apos;s square...</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-black text-[#6ee74b] uppercase">{clash.title}</p>
                    <p className="text-xs text-[#d6d3d1]">{clash.desc}</p>
                  </>
                )}
              </div>
            </div>

            <div className="pixel-panel p-4 space-y-2">
              <h3 className="text-xs font-black uppercase text-[#d9843b]">
                Rank Hierarchy (Strongest → Weakest)
              </h3>
              <div className="text-xs text-[#d6d3d1] leading-relaxed space-y-1.5">
                <p>
                  <strong>1.</strong> 5★ General → 4★ → 3★ → 2★ → 1★ General
                </p>
                <p>
                  <strong>2.</strong> Colonel → Lt. Colonel → Major → Captain
                </p>
                <p>
                  <strong>3.</strong> 1st Lt → 2nd Lt → Sergeant → Private
                </p>
                <div className="bg-[#16131b] border-2 border-[#0f0d13] p-2.5 space-y-1">
                  <p className="text-[#d9843b] font-bold">
                    ★ SPY: Kills all Officers (5★ Gen down to Sgt)!
                  </p>
                  <p className="text-[#6ee74b] font-bold">
                    ★ PRIVATE: Only piece that kills the Spy!
                  </p>
                  <p className="text-[#e04f4f] font-bold">
                    ★ FLAG: Killed by ANY piece (even enemy Flag).
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* LESSON 3: WIN CONDITIONS */}
        {tab === 'win' && (
          <div className="pixel-panel p-4 space-y-3">
            <h2 className="text-sm font-black uppercase text-[#6ee74b]">2 Ways to Win</h2>
            <div className="space-y-2 text-xs text-[#d6d3d1]">
              <div className="bg-[#16131b] border-2 border-[#0f0d13] p-3 space-y-1">
                <p className="font-black text-[#f5f5f4] uppercase">1. Capture the Enemy Flag</p>
                <p className="text-[#a8a29e]">
                  Challenge and eliminate your opponent&apos;s Flag with any piece.
                </p>
              </div>
              <div className="bg-[#16131b] border-2 border-[#0f0d13] p-3 space-y-1">
                <p className="font-black text-[#f5f5f4] uppercase">
                  2. March Flag to Opposite End
                </p>
                <p className="text-[#a8a29e]">
                  Reach Row 8 with no enemy adjacent for an <strong>instant win</strong> (or
                  survive 1 turn if an enemy is adjacent).
                </p>
              </div>
            </div>

            <div className="pixel-board-wood w-[260px] mx-auto shrink-0">
              <div className="relative aspect-square w-full border-2 border-[#382e3b] overflow-hidden">
                <div className="grid grid-cols-5 grid-rows-5 w-full h-full">
                  {Array.from({ length: 25 }, (_, i) => {
                    const r = Math.floor(i / 5);
                    const c = i % 5;
                    const highlightGoal = r === 0 && c === 2 && winRow === 0;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`flex items-center justify-center ${
                          (r + c) % 2 === 0 ? 'pixel-sq-light' : 'pixel-sq-dark'
                        } ${highlightGoal ? 'ring-2 ring-inset ring-[#6ee74b]' : ''}`}
                      />
                    );
                  })}
                </div>
                <div
                  className="absolute top-0 left-0 w-[20%] h-[20%] flex items-center justify-center pointer-events-none"
                  style={{
                    transform: `translate3d(200%, ${winRow * 100}%, 0)`,
                    transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <PieceTile rank="flag" side="white" />
                </div>
              </div>
            </div>

            <div className="bg-[#16131b] border-2 border-[#0f0d13] p-2.5 text-center text-xs font-bold text-[#6ee74b]">
              {winRow === 0
                ? '🏆 FLAG REACHED ROW 8 (NO ADJACENT ENEMY) — VICTORY!'
                : 'FLAG MARCHING TO OPPONENT BACK RANK...'}
            </div>
          </div>
        )}

        <footer className="pt-2 pb-4 text-center text-xs text-[#a8a29e]">
          vibe coded by @rufongabrillojr
        </footer>
      </div>
    </div>
  );
};
