/**
 * Tests for The Founders gamification system.
 * Ported from Python tests/test_founders.py
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FounderStore } from '../src/store/FounderStore.js';
import {
  ASK_QUOTA_BONUS,
  LEVELS,
  XP_DAILY_CHECKIN,
  XP_FEEDBACK_GIVEN,
  XP_MILESTONE_CUSTOM,
  XP_MILESTONE_MVP_LAUNCH,
  XP_SHOWCASE_POST,
  XP_WEEKLY_UPDATE,
  calculateDailyStreak,
  calculateWeeklyStreak,
  dailyStreakBonus,
  levelForXp,
  levelInfo,
  weeklyStreakBonus,
  xpProgressBar,
  xpToNextLevel,
} from '../src/store/xp.js';

// ── XP System Tests ────────────────────────────────────────────────────────

describe('XP System', () => {
  it('levelForXp returns correct levels at thresholds', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(100)).toBe(1);
    expect(levelForXp(499)).toBe(1);
    expect(levelForXp(500)).toBe(2);
    expect(levelForXp(1499)).toBe(2);
    expect(levelForXp(1500)).toBe(3);
    expect(levelForXp(3999)).toBe(3);
    expect(levelForXp(4000)).toBe(4);
    expect(levelForXp(9999)).toBe(4);
    expect(levelForXp(10000)).toBe(5);
    expect(levelForXp(99999)).toBe(5);
  });

  it('levelInfo returns correct names', () => {
    expect(levelInfo(1).name).toBe('White Rabbit');
    expect(levelInfo(5).name).toBe('Wonderland Founder');
  });

  it('xpToNextLevel calculates remaining XP', () => {
    expect(xpToNextLevel(0)).toBe(500);
    expect(xpToNextLevel(250)).toBe(250);
    expect(xpToNextLevel(500)).toBe(1000);
    expect(xpToNextLevel(10000)).toBeNull(); // max level
  });

  it('xpProgressBar has correct length and fills', () => {
    const bar = xpProgressBar(0, 10);
    expect(bar.length).toBe(10);
    expect(bar).toContain('\u2591'); // empty portion

    const fullBar = xpProgressBar(10000, 10);
    expect(fullBar).toBe('\u2588'.repeat(10)); // full bar at max
  });

  it('daily streak: no history', () => {
    const [streak, already] = calculateDailyStreak(null, '2025-01-15');
    expect(streak).toBe(1);
    expect(already).toBe(false);
  });

  it('daily streak: same day', () => {
    const [, already] = calculateDailyStreak('2025-01-15', '2025-01-15');
    expect(already).toBe(true);
  });

  it('daily streak: consecutive day', () => {
    const [streak, already] = calculateDailyStreak('2025-01-14', '2025-01-15');
    expect(streak).toBe(-1); // continues
    expect(already).toBe(false);
  });

  it('daily streak: gap resets', () => {
    const [streak, already] = calculateDailyStreak('2025-01-13', '2025-01-15');
    expect(streak).toBe(1); // reset
    expect(already).toBe(false);
  });

  it('weekly streak: no history', () => {
    const [streak, already] = calculateWeeklyStreak(null, '2025-01-15');
    expect(streak).toBe(1);
    expect(already).toBe(false);
  });

  it('weekly streak: same week', () => {
    // Both in same ISO week (Mon 2025-01-13 to Fri 2025-01-17)
    const [, already] = calculateWeeklyStreak('2025-01-13', '2025-01-17');
    expect(already).toBe(true);
  });

  it('weekly streak: consecutive week', () => {
    const [streak] = calculateWeeklyStreak('2025-01-06', '2025-01-13');
    expect(streak).toBe(-1); // continues
  });

  it('weekly streak: gap resets', () => {
    const [streak] = calculateWeeklyStreak('2025-01-01', '2025-01-15');
    expect(streak).toBe(1); // reset
  });

  it('daily streak bonus', () => {
    expect(dailyStreakBonus(1)).toBe(2);
    expect(dailyStreakBonus(5)).toBe(10);
    expect(dailyStreakBonus(10)).toBe(20);
    expect(dailyStreakBonus(100)).toBe(20); // capped
  });

  it('weekly streak bonus', () => {
    expect(weeklyStreakBonus(1)).toBe(10);
    expect(weeklyStreakBonus(5)).toBe(50);
    expect(weeklyStreakBonus(100)).toBe(50); // capped
  });

  it('ask quota bonus', () => {
    expect(ASK_QUOTA_BONUS[0] ?? 0).toBe(0);
    expect(ASK_QUOTA_BONUS[1] ?? 0).toBe(0);
    expect(ASK_QUOTA_BONUS[3] ?? 0).toBe(5);
    expect(ASK_QUOTA_BONUS[4] ?? 0).toBe(10);
    expect(ASK_QUOTA_BONUS[5] ?? 0).toBe(10_000_000);
  });
});

// ── FounderStore Tests ─────────────────────────────────────────────────────

describe('FounderStore', () => {
  let dir: string;
  let store: FounderStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'founders-test-'));
    store = new FounderStore(join(dir, 'test.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('create and get founder', () => {
    const founder = store.createFounder('12345', 'Alice', 'Python, ML');
    expect(founder.userId).toBe('12345');
    expect(founder.displayName).toBe('Alice');
    expect(founder.skills).toBe('Python, ML');
    expect(founder.xp).toBe(0);
    expect(founder.level).toBe(1);

    const fetched = store.getFounder('12345');
    expect(fetched).not.toBeNull();
    expect(fetched!.displayName).toBe('Alice');
  });

  it('get nonexistent founder returns null', () => {
    expect(store.getFounder('99999')).toBeNull();
  });

  it('update profile', () => {
    store.createFounder('1', 'Bob');
    store.updateFounderProfile('1', { tagline: 'Building stuff', bio: 'Long bio here' });
    const founder = store.getFounder('1')!;
    expect(founder.tagline).toBe('Building stuff');
    expect(founder.bio).toBe('Long bio here');
  });

  it('update profile allows clearing fields', () => {
    store.createFounder('1', 'Bob');
    store.updateFounderProfile('1', { tagline: 'Temp' });
    store.updateFounderProfile('1', { tagline: null });
    const founder = store.getFounder('1')!;
    expect(founder.tagline).toBeNull();
  });

  it('create project', () => {
    store.createFounder('1', 'Alice');
    const proj = store.createProject('1', { name: 'MyApp', description: 'An app', stage: 'mvp', isPrimary: true });
    expect(proj.name).toBe('MyApp');
    expect(proj.isPrimary).toBe(true);
  });

  it('multiple projects', () => {
    store.createFounder('1', 'Alice');
    store.createProject('1', { name: 'App1', isPrimary: true });
    store.createProject('1', { name: 'App2' });
    const projs = store.getProjects('1');
    expect(projs.length).toBe(2);
  });

  it('project by name (case-insensitive)', () => {
    store.createFounder('1', 'Alice');
    store.createProject('1', { name: 'MyApp' });
    const proj = store.getProjectByName('1', 'myapp');
    expect(proj).not.toBeNull();
    expect(proj!.name).toBe('MyApp');
  });

  it('update project', () => {
    store.createFounder('1', 'Alice');
    const proj = store.createProject('1', { name: 'App' });
    store.updateProject(proj.id, { description: 'Updated', stage: 'launched' });
    const updated = store.getProject(proj.id)!;
    expect(updated.description).toBe('Updated');
    expect(updated.stage).toBe('launched');
  });

  it('set primary project', () => {
    store.createFounder('1', 'Alice');
    store.createProject('1', { name: 'App1', isPrimary: true });
    const b = store.createProject('1', { name: 'App2' });
    const ok = store.setPrimaryProject('1', b.id);
    expect(ok).toBe(true);
    const projs = store.getProjects('1');
    const primary = projs.filter((p) => p.isPrimary);
    expect(primary.length).toBe(1);
    expect(primary[0].name).toBe('App2');
  });

  it('project names autocomplete', () => {
    store.createFounder('1', 'Alice');
    store.createProject('1', { name: 'Alpha' });
    store.createProject('1', { name: 'Beta' });
    const names = store.projectNames('1');
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
  });

  it('award XP', () => {
    store.createFounder('1', 'Alice');
    const [newXp, newLevel, leveledUp] = store.awardXp('1', 100, 'test');
    expect(newXp).toBe(100);
    expect(newLevel).toBe(1);
    expect(leveledUp).toBe(false);
  });

  it('award XP triggers level up', () => {
    store.createFounder('1', 'Alice');
    const [newXp, newLevel, leveledUp] = store.awardXp('1', 500, 'big_bonus');
    expect(newXp).toBe(500);
    expect(newLevel).toBe(2);
    expect(leveledUp).toBe(true);
    const founder = store.getFounder('1')!;
    expect(founder.level).toBe(2);
  });

  it('daily checkin', () => {
    store.createFounder('1', 'Alice');
    const [checkin, xp, leveledUp, error] = store.recordDailyCheckin(
      '1', 'Worked on feature X today', null, null, '2025-01-15',
    );
    expect(error).toBe('');
    expect(checkin).not.toBeNull();
    expect(xp).toBeGreaterThanOrEqual(XP_DAILY_CHECKIN);
    const founder = store.getFounder('1')!;
    expect(founder.streakDaily).toBe(1);
    expect(founder.lastDailyCheckin).toBe('2025-01-15');
  });

  it('daily checkin duplicate rejected', () => {
    store.createFounder('1', 'Alice');
    store.recordDailyCheckin('1', 'First check-in', null, null, '2025-01-15');
    const [, , , error] = store.recordDailyCheckin('1', 'Second check-in', null, null, '2025-01-15');
    expect(error.toLowerCase()).toContain('already');
  });

  it('daily checkin too short', () => {
    store.createFounder('1', 'Alice');
    const [, , , error] = store.recordDailyCheckin('1', 'hi', null, null, '2025-01-15');
    expect(error).toContain('10');
  });

  it('daily streak builds over consecutive days', () => {
    store.createFounder('1', 'Alice');
    store.recordDailyCheckin('1', 'Day one work items', null, null, '2025-01-15');
    store.recordDailyCheckin('1', 'Day two work items', null, null, '2025-01-16');
    const founder = store.getFounder('1')!;
    expect(founder.streakDaily).toBe(2);
  });

  it('weekly checkin', () => {
    store.createFounder('1', 'Alice');
    const [checkin, xp, , error] = store.recordWeeklyCheckin(
      '1', 'Big milestones this week!', 'Launched MVP', 'Keep shipping', '10 users', null, '2025-01-15',
    );
    expect(error).toBe('');
    expect(xp).toBeGreaterThanOrEqual(XP_WEEKLY_UPDATE);
  });

  it('weekly checkin duplicate rejected', () => {
    store.createFounder('1', 'Alice');
    store.recordWeeklyCheckin('1', 'Week 1 update log', null, null, null, null, '2025-01-15');
    const [, , , error] = store.recordWeeklyCheckin('1', 'Duplicate weekly post', null, null, null, null, '2025-01-17');
    expect(error.toLowerCase()).toContain('already');
  });

  it('milestone', () => {
    store.createFounder('1', 'Alice');
    const proj = store.createProject('1', { name: 'App' });
    const [xp, , , error] = store.recordMilestone('1', 'mvp_launch', 'Launched MVP!', null, proj.id);
    expect(error).toBe('');
    expect(xp).toBe(XP_MILESTONE_MVP_LAUNCH);
  });

  it('milestone unique per project', () => {
    store.createFounder('1', 'Alice');
    const proj = store.createProject('1', { name: 'App' });
    store.recordMilestone('1', 'mvp_launch', 'V1', null, proj.id);
    const [, , , error] = store.recordMilestone('1', 'mvp_launch', 'V2', null, proj.id);
    expect(error.toLowerCase()).toContain('already');
  });

  it('custom milestones are not unique', () => {
    store.createFounder('1', 'Alice');
    store.recordMilestone('1', 'custom', 'Custom 1');
    const [xp, , , error] = store.recordMilestone('1', 'custom', 'Custom 2');
    expect(error).toBe('');
    expect(xp).toBe(XP_MILESTONE_CUSTOM);
  });

  it('feedback self-rejection', () => {
    store.createFounder('1', 'Alice');
    const [, , error] = store.recordFeedback('1', '1', '2025-01-15');
    expect(error.toLowerCase()).toContain('yourself');
  });

  it('feedback daily cap', () => {
    store.createFounder('1', 'Alice');
    store.createFounder('2', 'Bob');
    const day = '2025-01-15';
    for (let i = 0; i < 5; i++) {
      store.recordFeedback('1', '2', day);
    }
    const [, , error] = store.recordFeedback('1', '2', day);
    expect(error.toLowerCase()).toContain('cap');
  });

  it('feedback XP', () => {
    store.createFounder('1', 'Alice');
    store.createFounder('2', 'Bob');
    const [xp, , error] = store.recordFeedback('1', '2', '2025-01-15');
    expect(error).toBe('');
    expect(xp).toBe(XP_FEEDBACK_GIVEN);
    const founder = store.getFounder('1')!;
    expect(founder.xp).toBe(XP_FEEDBACK_GIVEN);
  });

  it('showcase requires level 3', () => {
    store.createFounder('1', 'Alice');
    const [can, error] = store.canShowcase('1', '2025-01-15');
    expect(can).toBe(false);
    expect(error).toContain('Level 3');
  });

  it('showcase monthly limit', () => {
    store.createFounder('1', 'Alice');
    store.addXp('1', 1500);
    store.setLevel('1', 3);
    const [can] = store.canShowcase('1', '2025-01-15');
    expect(can).toBe(true);
    store.recordShowcase('1', '2025-01-15');
    const [can2, error2] = store.canShowcase('1', '2025-01-20');
    expect(can2).toBe(false);
    expect(error2.toLowerCase()).toContain('once per month');
  });

  it('showcase allowed in different month', () => {
    store.createFounder('1', 'Alice');
    store.addXp('1', 1500);
    store.setLevel('1', 3);
    store.recordShowcase('1', '2025-01-15');
    const [can] = store.canShowcase('1', '2025-02-01');
    expect(can).toBe(true);
  });

  it('leaderboard ordered by XP', () => {
    store.createFounder('1', 'Alice');
    store.createFounder('2', 'Bob');
    store.addXp('1', 100);
    store.addXp('2', 200);
    const lb = store.leaderboard(10);
    expect(lb.length).toBe(2);
    expect(lb[0].userId).toBe('2'); // Bob has more XP
  });

  it('list founders with skill filter', () => {
    store.createFounder('1', 'Alice', 'Python, ML');
    store.createFounder('2', 'Bob', 'React, TypeScript');
    const results = store.listFounders({ skillFilter: 'python' });
    expect(results.length).toBe(1);
    expect(results[0].userId).toBe('1');
  });

  it('list founders opt-in only', () => {
    store.createFounder('1', 'Alice');
    store.createFounder('2', 'Bob');
    store.setOptInMatching('2', true);
    const results = store.listFounders({ optInOnly: true });
    expect(results.length).toBe(1);
    expect(results[0].userId).toBe('2');
  });

  it('count founders', () => {
    store.createFounder('1', 'Alice');
    store.createFounder('2', 'Bob');
    expect(store.countFounders()).toBe(2);
  });
});
