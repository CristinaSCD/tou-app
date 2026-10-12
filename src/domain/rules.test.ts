import { describe, expect, it } from 'vitest';
import * as actions from './actions';
import { RuleError } from './actions';
import { buildSeed } from './seed';
import { canViewIdea, leaderboard, nextPanelMeeting, pilotStatus, readyForPanel, scoreView, visibleIdeas } from './rules';
import type { AppState, IdeaContent } from './types';

const NOW = new Date('2026-10-08T10:00:00Z');
const seed = () => buildSeed(NOW);
const who = (s: AppState, id: string) => s.colleagues.find((c) => c.id === id)!;
const idea = (s: AppState, id: string) => s.ideas.find((i) => i.id === id)!;

const STAFF = 'c-jonah'; // general staff, Bristol
const REVIEWER = 'c-priya';
const ADMIN = 'c-dev';
const CONFIDENTIAL = 'idea-framework-fees'; // submitted by c-mateus, under review
const CONFIDENTIAL_PILOT = 'idea-tender-benchmarks'; // pilot owner c-amara
const NEW_IDEA = 'idea-drawing-register'; // submitted by c-amara, stage submitted
const REVIEWERS_OWN = 'idea-lessons-learned'; // submitted by reviewer c-callum
const RATINGS = { impact: 4, cost: 3, feasibility: 5 };

const content: IdeaContent = {
  title: 'A new idea',
  problem: 'A problem',
  solution: 'A solution',
  categoryId: 'cat-tools',
  expectedImpact: 'Some impact',
};

describe('confidential ideas', () => {
  it('are invisible to general staff, visible to submitter and panel', () => {
    const s = seed();
    expect(visibleIdeas(s, who(s, STAFF)).some((i) => i.confidential)).toBe(false);
    expect(canViewIdea(who(s, 'c-mateus'), idea(s, CONFIDENTIAL))).toBe(true);
    expect(canViewIdea(who(s, REVIEWER), idea(s, CONFIDENTIAL))).toBe(true);
  });

  it('cannot be voted or commented on by colleagues without access, with the same error as a missing idea', () => {
    const s = seed();
    expect(() => actions.setVote(s, STAFF, CONFIDENTIAL, true)).toThrow('This idea is not available.');
    expect(() => actions.addComment(s, STAFF, CONFIDENTIAL, 'Hello')).toThrow('This idea is not available.');
    expect(() => actions.setVote(s, STAFF, 'no-such-idea', true)).toThrow('This idea is not available.');
  });

  it('give a pilot owner access to their assigned idea only', () => {
    const s = seed();
    const amara = who(s, 'c-amara');
    expect(canViewIdea(amara, idea(s, CONFIDENTIAL_PILOT))).toBe(true);
    expect(canViewIdea(amara, idea(s, CONFIDENTIAL))).toBe(false);
  });

  it('are hidden from an admin who is not on the panel', () => {
    const s = actions.setReviewer(seed(), ADMIN, ADMIN, false);
    expect(canViewIdea(who(s, ADMIN), idea(s, CONFIDENTIAL))).toBe(false);
  });

  it('never appear on the leaderboard', () => {
    let s = seed();
    s = actions.setVote(s, REVIEWER, CONFIDENTIAL, true, NOW.toISOString());
    expect(leaderboard(s, NOW, 100).some((row) => row.idea.confidential)).toBe(false);
  });
});

describe('voting', () => {
  it('records one vote per colleague, even if the same vote arrives twice (M4.1, M4.2, M4.6)', () => {
    let s = seed();
    const before = idea(s, NEW_IDEA).votes.length;
    s = actions.setVote(s, 'c-eleanor', NEW_IDEA, true);
    s = actions.setVote(s, 'c-eleanor', NEW_IDEA, true);
    expect(idea(s, NEW_IDEA).votes.length).toBe(before + 1);
    expect(idea(s, NEW_IDEA).votes.filter((v) => v.colleagueId === 'c-eleanor')).toHaveLength(1);
  });

  it('lets a colleague remove their vote (M4.3)', () => {
    let s = seed();
    const before = idea(s, NEW_IDEA).votes.length;
    s = actions.setVote(s, 'c-eleanor', NEW_IDEA, true);
    s = actions.setVote(s, 'c-eleanor', NEW_IDEA, false);
    expect(idea(s, NEW_IDEA).votes.length).toBe(before);
  });

  it('does not let colleagues vote for their own idea (M4.4)', () => {
    expect(() => actions.setVote(seed(), 'c-amara', NEW_IDEA, true)).toThrow(/your own idea/);
  });

  it('is closed once an idea is Implemented or Declined (M4.5)', () => {
    const s = seed();
    expect(() => actions.setVote(s, STAFF, 'idea-reverse-mentoring', true)).toThrow(/final outcome/);
    expect(() => actions.setVote(s, STAFF, 'idea-kit-lockers', true)).toThrow(/final outcome/);
  });
});

describe('scoring', () => {
  it('is for reviewers only', () => {
    expect(() => actions.saveScore(seed(), STAFF, NEW_IDEA, RATINGS, '')).toThrow(RuleError);
  });

  it('excludes a reviewer from scoring their own idea', () => {
    expect(() => actions.saveScore(seed(), 'c-callum', REVIEWERS_OWN, RATINGS, '')).toThrow(/excluded from scoring/);
  });

  it('keeps one score per reviewer and accepts only 1 to 5', () => {
    let s = seed();
    s = actions.saveScore(s, REVIEWER, NEW_IDEA, RATINGS, 'First');
    s = actions.saveScore(s, REVIEWER, NEW_IDEA, { ...RATINGS, impact: 2 }, 'Second');
    const mine = idea(s, NEW_IDEA).scores.filter((x) => x.reviewerId === REVIEWER);
    expect(mine).toHaveLength(1);
    expect(mine[0].impact).toBe(2);
    expect(() => actions.saveScore(s, REVIEWER, NEW_IDEA, { ...RATINGS, cost: 6 }, '')).toThrow(RuleError);
  });

  it('is closed once the idea has left review', () => {
    expect(() => actions.saveScore(seed(), REVIEWER, 'idea-site-checklist', RATINGS, '')).toThrow(/Scoring is closed/);
  });

  it('names the rating that is missing or out of range and saves nothing (M6.5)', () => {
    const s = seed();
    expect(() => actions.saveScore(s, REVIEWER, NEW_IDEA, { impact: 4, cost: 0, feasibility: 9 }, '')).toThrow(/Nothing was saved.*cost, feasibility/);
  });

  it('hides other reviewers\' scores until a reviewer has saved their own (M6.7, M6.8)', () => {
    let s = seed();
    const target = 'idea-calc-templates'; // scored by marguerite, priya and isla; not by tobias
    expect(scoreView(who(s, 'c-tobias'), idea(s, target))).toBe('hidden');
    expect(scoreView(who(s, 'c-priya'), idea(s, target))).toBe('named');
    s = actions.saveScore(s, 'c-tobias', target, RATINGS, '');
    expect(scoreView(who(s, 'c-tobias'), idea(s, target))).toBe('named');
  });

  it('shows scores without reviewer names to the submitter and other staff (M3.4, M5.4)', () => {
    const s = seed();
    expect(scoreView(who(s, 'c-jonah'), idea(s, 'idea-calc-templates'))).toBe('anonymous'); // submitter
    expect(scoreView(who(s, 'c-bethan'), idea(s, 'idea-calc-templates'))).toBe('anonymous'); // other staff
    expect(scoreView(who(s, 'c-callum'), idea(s, REVIEWERS_OWN))).toBe('anonymous'); // reviewer on own idea
    expect(scoreView(who(s, 'c-bethan'), idea(s, CONFIDENTIAL))).toBe('hidden');
  });

  it('keeps a removed reviewer\'s scores but ends their access (M6.11)', () => {
    const s = actions.setReviewer(seed(), ADMIN, 'c-tobias', false);
    expect(canViewIdea(who(s, 'c-tobias'), idea(s, CONFIDENTIAL))).toBe(false);
    expect(idea(s, CONFIDENTIAL).scores.some((x) => x.reviewerId === 'c-tobias')).toBe(true);
    expect(() => actions.saveScore(s, 'c-tobias', NEW_IDEA, RATINGS, '')).toThrow(RuleError);
    expect(() => actions.recordDecision(s, 'c-tobias', NEW_IDEA, 'under_review', 'x')).toThrow(RuleError);
  });

  it('never changes the stage, however high or low the scores', () => {
    let s = seed();
    for (const r of ['c-dev', 'c-priya', 'c-tobias', 'c-isla', 'c-marguerite'])
      s = actions.saveScore(s, r, NEW_IDEA, { impact: 5, cost: 5, feasibility: 5 }, '');
    expect(idea(s, NEW_IDEA).stage).toBe('submitted');
  });
});

describe('stage changes', () => {
  it('can only be recorded by reviewers', () => {
    expect(() => actions.recordDecision(seed(), STAFF, NEW_IDEA, 'under_review', 'Because')).toThrow(/Only innovation panel reviewers/);
    // The submitter cannot move their own idea either.
    expect(() => actions.recordDecision(seed(), 'c-amara', NEW_IDEA, 'under_review', 'Because')).toThrow(RuleError);
  });

  it('require a written reason', () => {
    expect(() => actions.recordDecision(seed(), REVIEWER, NEW_IDEA, 'under_review', '   ')).toThrow(/written reason/);
  });

  it('cannot skip stages', () => {
    const s = seed();
    expect(() => actions.recordDecision(s, REVIEWER, NEW_IDEA, 'piloting', 'Skip', 'c-amara')).toThrow(RuleError);
    expect(() => actions.recordDecision(s, REVIEWER, NEW_IDEA, 'implemented', 'Skip')).toThrow(RuleError);
    expect(() => actions.recordDecision(s, REVIEWER, 'idea-reverse-mentoring', 'declined', 'Reopen')).toThrow(/final outcome/);
  });

  it('record the reason and notify the submitter', () => {
    const s = actions.recordDecision(seed(), REVIEWER, NEW_IDEA, 'under_review', 'Worth a closer look.');
    const changed = idea(s, NEW_IDEA);
    expect(changed.stage).toBe('under_review');
    expect(changed.decisions.at(-1)).toMatchObject({ from: 'submitted', to: 'under_review', reason: 'Worth a closer look.', recordedById: REVIEWER });
    expect(s.notifications.some((n) => n.toId === 'c-amara' && n.ideaId === NEW_IDEA && !n.read)).toBe(true);
  });

  it('only notify the submitter when the stage actually changes (S2.3)', () => {
    const s = seed();
    const count = (x: AppState) => x.notifications.filter((n) => n.toId === 'c-rory').length;
    const kept = actions.recordDecision(s, REVIEWER, 'idea-drone-surveys', 'under_review', 'Still waiting for a quote.');
    expect(idea(kept, 'idea-drone-surveys').decisions.at(-1)!.reason).toBe('Still waiting for a quote.');
    expect(count(kept)).toBe(count(s));
    const moved = actions.recordDecision(s, REVIEWER, 'idea-drone-surveys', 'declined', 'Too costly.');
    expect(count(moved)).toBe(count(s) + 1);
  });

  it('need a pilot owner to move to Piloting, and grant that owner access', () => {
    const s = seed();
    expect(() => actions.recordDecision(s, REVIEWER, CONFIDENTIAL, 'piloting', 'Go')).toThrow(/pilot owner/);
    const next = actions.recordDecision(s, REVIEWER, CONFIDENTIAL, 'piloting', 'Go', 'c-bethan');
    expect(canViewIdea(who(next, 'c-bethan'), idea(next, CONFIDENTIAL))).toBe(true);
    expect(next.notifications.some((n) => n.toId === 'c-bethan' && /confidential/.test(n.text))).toBe(true);
  });

  it('cannot close a pilot before the pilot owner has submitted results', () => {
    expect(() => actions.recordDecision(seed(), REVIEWER, 'idea-site-checklist', 'implemented', 'Done')).toThrow(/final results/);
  });
});

describe('pilot results', () => {
  it('can only be submitted by the assigned pilot owner, once', () => {
    let s = seed();
    expect(() => actions.submitPilotResult(s, 'c-sanjay', 'idea-site-checklist', RATINGS, 'Summary')).toThrow(/pilot owner/);
    expect(() => actions.submitPilotResult(s, REVIEWER, 'idea-site-checklist', RATINGS, 'Summary')).toThrow(/pilot owner/);
    s = actions.submitPilotResult(s, 'c-bethan', 'idea-site-checklist', RATINGS, 'Summary');
    expect(readyForPanel(s).pilotResults.some((i) => i.id === 'idea-site-checklist')).toBe(true);
    expect(idea(s, 'idea-site-checklist').stage).toBe('piloting'); // the owner does not decide the outcome
    expect(pilotStatus(idea(s, 'idea-site-checklist'))).toBe('Results in, awaiting panel');
    expect(() => actions.submitPilotResult(s, 'c-bethan', 'idea-site-checklist', RATINGS, 'Again')).toThrow(RuleError);
    s = actions.recordDecision(s, REVIEWER, 'idea-site-checklist', 'implemented', 'Pilot worked well.');
    expect(idea(s, 'idea-site-checklist').stage).toBe('implemented');
  });
});

describe('changing the pilot owner', () => {
  it('moves confidential access to the new owner and keeps the change in the history', () => {
    const s = seed();
    expect(() => actions.reassignPilot(s, 'c-amara', CONFIDENTIAL_PILOT, 'c-bethan', 'On leave')).toThrow(/Only innovation panel reviewers/);
    expect(() => actions.reassignPilot(s, REVIEWER, CONFIDENTIAL_PILOT, 'c-bethan', ' ')).toThrow(/reason/);
    const next = actions.reassignPilot(s, REVIEWER, CONFIDENTIAL_PILOT, 'c-bethan', 'Amara is on leave.');
    expect(canViewIdea(who(next, 'c-amara'), idea(next, CONFIDENTIAL_PILOT))).toBe(false);
    expect(canViewIdea(who(next, 'c-bethan'), idea(next, CONFIDENTIAL_PILOT))).toBe(true);
    expect(idea(next, CONFIDENTIAL_PILOT).decisions.at(-1)).toMatchObject({ kind: 'reassignment', from: 'piloting', to: 'piloting' });
    expect(next.notifications.some((n) => n.toId === 'c-bethan' && n.ideaId === CONFIDENTIAL_PILOT)).toBe(true);
  });

  it('is not possible once results are in', () => {
    expect(() => actions.reassignPilot(seed(), REVIEWER, 'idea-low-carbon-concrete', 'c-rory', 'x')).toThrow(/results are already in/);
  });
});

describe('changing confidentiality', () => {
  it('lets the submitter hide a public idea at any stage, immediately (M2.6)', () => {
    const s = actions.setConfidential(seed(), 'c-jonah', 'idea-calc-templates', true); // under review
    expect(canViewIdea(who(s, 'c-bethan'), idea(s, 'idea-calc-templates'))).toBe(false);
    expect(() => actions.addComment(s, 'c-sanjay', 'idea-calc-templates', 'Hello')).toThrow('This idea is not available.');
  });

  it('allows going public again only while Submitted (M2.7)', () => {
    let s = actions.setConfidential(seed(), 'c-amara', NEW_IDEA, true);
    s = actions.setConfidential(s, 'c-amara', NEW_IDEA, false);
    expect(idea(s, NEW_IDEA).confidential).toBe(false);
    expect(() => actions.setConfidential(seed(), 'c-mateus', CONFIDENTIAL, false)).toThrow(/only be made public while/);
  });

  it('is for the submitter only', () => {
    expect(() => actions.setConfidential(seed(), REVIEWER, NEW_IDEA, true)).toThrow(RuleError);
    expect(() => actions.setConfidential(seed(), REVIEWER, CONFIDENTIAL, false)).toThrow(RuleError);
  });
});

describe('comments', () => {
  const TARGET = 'idea-drawing-register'; // one comment, by c-rory
  const first = (s: AppState) => idea(s, TARGET).comments[0];

  it('can be edited by their author and are then marked as edited (S1.4)', () => {
    const s = actions.editComment(seed(), 'c-rory', TARGET, first(seed()).id, 'Updated text');
    expect(first(s)).toMatchObject({ text: 'Updated text' });
    expect(first(s).editedAt).toBeTruthy();
  });

  it('can be deleted by their author (S1.5)', () => {
    const s = actions.deleteComment(seed(), 'c-rory', TARGET, first(seed()).id);
    expect(idea(s, TARGET).comments).toHaveLength(0);
  });

  it('cannot be edited or deleted by anyone else, including reviewers (S1.7)', () => {
    const s = seed();
    for (const other of [STAFF, 'c-amara', REVIEWER]) {
      expect(() => actions.editComment(s, other, TARGET, first(s).id, 'Changed')).toThrow(RuleError);
      expect(() => actions.deleteComment(s, other, TARGET, first(s).id)).toThrow(RuleError);
      expect(() => actions.removeCommentAsAdmin(s, other, TARGET, first(s).id)).toThrow(/Only the Admin/);
    }
  });

  it('show as "Removed by Admin" when the Admin removes them, with the text gone (S1.6)', () => {
    const s = actions.removeCommentAsAdmin(seed(), ADMIN, TARGET, first(seed()).id);
    expect(first(s)).toMatchObject({ removedByAdmin: true, text: '' });
    expect(() => actions.editComment(s, 'c-rory', TARGET, first(s).id, 'Back again')).toThrow(RuleError);
  });

  it('can still be added after a final outcome (S1.8)', () => {
    expect(() => actions.addComment(seed(), STAFF, 'idea-reverse-mentoring', 'Glad this went ahead.')).not.toThrow();
  });
});

describe('editing, withdrawing and resubmitting', () => {
  it('lets only the submitter edit or withdraw, and only while Submitted', () => {
    const s = seed();
    expect(() => actions.editIdea(s, STAFF, NEW_IDEA, content)).toThrow(RuleError);
    expect(() => actions.editIdea(s, REVIEWER, NEW_IDEA, content)).toThrow(RuleError);
    expect(actions.editIdea(s, 'c-amara', NEW_IDEA, content).ideas.find((i) => i.id === NEW_IDEA)!.title).toBe('A new idea');
    expect(() => actions.editIdea(s, 'c-jonah', 'idea-calc-templates', content)).toThrow(/locked/);
    expect(() => actions.withdrawIdea(s, 'c-jonah', 'idea-calc-templates')).toThrow(/locked/);
    expect(actions.withdrawIdea(s, 'c-amara', NEW_IDEA).ideas.some((i) => i.id === NEW_IDEA)).toBe(false);
  });

  it('allows a declined idea to be resubmitted once, keeping the history', () => {
    let s = seed();
    expect(() => actions.resubmitIdea(s, 'c-niamh', 'idea-kit-lockers', content)).toThrow(RuleError);
    s = actions.resubmitIdea(s, 'c-rory', 'idea-kit-lockers', content);
    const again = idea(s, 'idea-kit-lockers');
    expect(again.stage).toBe('submitted');
    expect(again.scores).toHaveLength(0);
    expect(again.previousVersions).toHaveLength(1);
    expect(again.previousVersions[0].scores).toHaveLength(3);
    expect(again.previousVersions[0].declineReason).toMatch(/revised proposal/);

    s = actions.recordDecision(s, REVIEWER, 'idea-kit-lockers', 'declined', 'Still not enough detail.');
    expect(() => actions.resubmitIdea(s, 'c-rory', 'idea-kit-lockers', content)).toThrow(/already been resubmitted once/);
  });

  it('rejects incomplete submissions and retired categories', () => {
    let s = seed();
    expect(() => actions.submitIdea(s, STAFF, { ...content, problem: ' ' }, false)).toThrow(/the problem it solves/);
    s = actions.setCategoryActive(s, ADMIN, 'cat-tools', false);
    expect(() => actions.submitIdea(s, STAFF, content, false)).toThrow(/category/);
  });
});

describe('admin', () => {
  it('functions are closed to reviewers and staff', () => {
    const s = seed();
    expect(() => actions.addCategory(s, REVIEWER, 'New')).toThrow(/Only the admin/);
    expect(() => actions.setReviewer(s, STAFF, STAFF, true)).toThrow(/Only the admin/);
    expect(() => actions.setCategoryActive(s, STAFF, 'cat-tools', false)).toThrow(/Only the admin/);
  });

  it('a newly appointed reviewer gains panel permissions', () => {
    const s = actions.setReviewer(seed(), ADMIN, STAFF, true);
    expect(canViewIdea(who(s, STAFF), idea(s, CONFIDENTIAL))).toBe(true);
    expect(() => actions.saveScore(s, STAFF, NEW_IDEA, RATINGS, '')).not.toThrow();
  });
});

describe('panel meeting date', () => {
  it('is the first Tuesday of the month', () => {
    expect(nextPanelMeeting(new Date(2026, 9, 8)).toDateString()).toBe(new Date(2026, 10, 3).toDateString());
    expect(nextPanelMeeting(new Date(2026, 9, 1)).toDateString()).toBe(new Date(2026, 9, 6).toDateString());
    expect(nextPanelMeeting(new Date(2026, 9, 6)).toDateString()).toBe(new Date(2026, 9, 6).toDateString());
  });
});
