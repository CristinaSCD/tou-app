import type { AppState, Colleague, Comment, CriterionKey, Idea, Office, Score, Stage } from './types';

/**
 * Every "who can do what" rule lives in this file. Screens use these to decide
 * what to show, and actions.ts calls the same functions before changing anything,
 * so a rule cannot be bypassed by a screen forgetting to hide a button.
 *
 * Functions named `...Blocker` return null when the action is allowed, or a
 * sentence explaining why it is not.
 */

export const OFFICES: Office[] = ['Bristol', 'Leeds', 'Glasgow'];

export const STAGES: Stage[] = ['submitted', 'under_review', 'piloting', 'implemented', 'declined'];

export const STAGE_LABEL: Record<Stage, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  piloting: 'Piloting',
  implemented: 'Implemented',
  declined: 'Declined',
};

export const CRITERIA: { key: CriterionKey; label: string; hint: string }[] = [
  { key: 'impact', label: 'Impact', hint: '1 = little impact, 5 = high impact' },
  { key: 'cost', label: 'Cost', hint: '1 = expensive, 5 = cheap' },
  { key: 'feasibility', label: 'Feasibility', hint: '1 = very hard, 5 = straightforward' },
];

export const MAX_RESUBMISSIONS = 1;

/** Stages the panel can record from each stage. Same stage means "kept under review". */
export const TRANSITIONS: Record<Stage, Stage[]> = {
  submitted: ['under_review', 'declined'],
  under_review: ['piloting', 'under_review', 'declined'],
  piloting: ['implemented', 'declined'],
  implemented: [],
  declined: [],
};

export const isSubmitter = (c: Colleague, idea: Idea) => idea.submitterId === c.id;
export const isPilotOwner = (c: Colleague, idea: Idea) => idea.pilotOwnerId === c.id;

// ---- Visibility -----------------------------------------------------------

/** Confidential ideas exist only for the submitter, the panel and the assigned pilot owner. */
export function canViewIdea(c: Colleague, idea: Idea): boolean {
  if (!idea.confidential) return true;
  return isSubmitter(c, idea) || c.isReviewer || isPilotOwner(c, idea);
}

/**
 * How a colleague sees the panel's scores on an idea they can open (PRD M3.4, M5.4, M6.7, M6.8).
 * - anonymous: scores and feedback without reviewer names. Everyone outside the panel, and a
 *   reviewer looking at their own idea.
 * - named: a reviewer who has scored, or who can no longer score.
 * - hidden: a reviewer who has not scored yet, so their own score is not influenced.
 */
export type ScoreView = 'named' | 'anonymous' | 'hidden';

export function scoreView(c: Colleague, idea: Idea): ScoreView {
  if (!canViewIdea(c, idea)) return 'hidden';
  if (!c.isReviewer || isSubmitter(c, idea)) return 'anonymous';
  const hasScored = idea.scores.some((s) => s.reviewerId === c.id);
  return hasScored || scoreBlocker(c, idea) ? 'named' : 'hidden';
}

/** Earlier versions of a resubmitted idea are context for the panel, and for the submitter. */
export const canSeePreviousVersions = (c: Colleague, idea: Idea) =>
  canViewIdea(c, idea) && (c.isReviewer || isSubmitter(c, idea));

/** Shown to everyone who can see the idea once the pilot owner has reported back (PRD M8.6). */
export const pilotStatus = (idea: Idea): string | null =>
  idea.stage === 'piloting' && idea.pilotResult ? 'Results in, awaiting panel' : null;

export const isClosed = (idea: Idea) => idea.stage === 'implemented' || idea.stage === 'declined';

export const canSeePanel = (c: Colleague) => c.isReviewer;
export const canSeeDashboard = (c: Colleague) => c.isAdmin || c.isReviewer;
export const canAdminister = (c: Colleague) => c.isAdmin;

export const visibleIdeas = (state: AppState, c: Colleague) => state.ideas.filter((i) => canViewIdea(c, i));

// ---- Actions --------------------------------------------------------------

const NOT_AVAILABLE = 'This idea is not available.';

export function voteBlocker(c: Colleague, idea: Idea): string | null {
  if (!canViewIdea(c, idea)) return NOT_AVAILABLE;
  if (isSubmitter(c, idea)) return 'You cannot vote for your own idea.';
  if (isClosed(idea)) return 'Voting has closed because this idea has reached a final outcome.';
  return null;
}

/** A submitter can make their idea confidential at any time, and public again only while Submitted. */
export function confidentialityBlocker(c: Colleague, idea: Idea, makeConfidential: boolean): string | null {
  if (!canViewIdea(c, idea)) return NOT_AVAILABLE;
  if (!isSubmitter(c, idea)) return 'Only the colleague who submitted an idea can change whether it is confidential.';
  if (!makeConfidential && idea.stage !== 'submitted')
    return 'A confidential idea can only be made public while it is still Submitted.';
  return null;
}

/** Authors can edit or delete their own comments. */
export function ownCommentBlocker(c: Colleague, idea: Idea, comment: Comment): string | null {
  if (!canViewIdea(c, idea)) return NOT_AVAILABLE;
  if (comment.authorId !== c.id) return 'You can only change your own comments.';
  if (comment.removedByAdmin) return 'This comment has been removed by the Admin.';
  return null;
}

/** The Admin can remove any comment, which then shows as "Removed by Admin". */
export function adminRemoveCommentBlocker(c: Colleague, idea: Idea, comment: Comment): string | null {
  if (!canViewIdea(c, idea)) return NOT_AVAILABLE;
  if (!c.isAdmin) return 'Only the Admin can remove another colleague\'s comment.';
  if (comment.removedByAdmin) return 'This comment has already been removed.';
  return null;
}

/** The panel can hand a pilot to another colleague if the owner becomes unavailable. */
export function reassignPilotBlocker(c: Colleague, idea: Idea): string | null {
  if (!canViewIdea(c, idea)) return NOT_AVAILABLE;
  if (!c.isReviewer) return 'Only innovation panel reviewers can change the pilot owner.';
  if (idea.stage !== 'piloting') return 'This idea is not being piloted.';
  if (idea.pilotResult) return 'The final results are already in, so the pilot owner cannot be changed.';
  return null;
}

export function commentBlocker(c: Colleague, idea: Idea): string | null {
  return canViewIdea(c, idea) ? null : NOT_AVAILABLE;
}

export function scoreBlocker(c: Colleague, idea: Idea): string | null {
  if (!c.isReviewer) return 'Only innovation panel reviewers can score ideas.';
  if (isSubmitter(c, idea)) return 'You submitted this idea, so you are excluded from scoring it.';
  if (idea.stage !== 'submitted' && idea.stage !== 'under_review')
    return 'Scoring is closed once the panel has moved an idea on from review.';
  return null;
}

export function decisionBlocker(c: Colleague, idea: Idea, to?: Stage): string | null {
  if (!c.isReviewer) return 'Only innovation panel reviewers can record a stage change.';
  if (TRANSITIONS[idea.stage].length === 0) return 'This idea has reached a final outcome.';
  if (idea.stage === 'piloting' && !idea.pilotResult)
    return 'The pilot owner has not submitted the final results yet.';
  if (to && !TRANSITIONS[idea.stage].includes(to))
    return `An idea cannot move from ${STAGE_LABEL[idea.stage]} to ${STAGE_LABEL[to]}.`;
  return null;
}

export function editBlocker(c: Colleague, idea: Idea): string | null {
  if (!isSubmitter(c, idea)) return 'Only the colleague who submitted an idea can change or withdraw it.';
  if (idea.stage !== 'submitted') return 'This idea is locked because the panel has started reviewing it.';
  return null;
}

export function resubmitBlocker(c: Colleague, idea: Idea): string | null {
  if (!isSubmitter(c, idea)) return 'Only the colleague who submitted an idea can resubmit it.';
  if (idea.stage !== 'declined') return 'Only declined ideas can be resubmitted.';
  if (idea.resubmissions >= MAX_RESUBMISSIONS) return 'This idea has already been resubmitted once.';
  return null;
}

export function pilotResultBlocker(c: Colleague, idea: Idea): string | null {
  if (!isPilotOwner(c, idea)) return 'Only the assigned pilot owner can submit pilot results.';
  if (idea.stage !== 'piloting') return 'This idea is not being piloted.';
  if (idea.pilotResult) return 'Final results have already been submitted for this pilot.';
  return null;
}

// ---- Derived views --------------------------------------------------------

export function averageScores(scores: Score[]): Record<CriterionKey, number> | null {
  if (scores.length === 0) return null;
  const avg = (k: CriterionKey) => scores.reduce((sum, s) => sum + s[k], 0) / scores.length;
  return { impact: avg('impact'), cost: avg('cost'), feasibility: avg('feasibility') };
}

/** Everything goes to the next panel meeting: there is no pre-screening. */
export function readyForPanel(state: AppState) {
  return {
    pilotResults: state.ideas.filter((i) => i.stage === 'piloting' && i.pilotResult),
    newIdeas: state.ideas.filter((i) => i.stage === 'submitted'),
    carriedOver: state.ideas.filter((i) => i.stage === 'under_review'),
  };
}

/** The panel meets on the first Tuesday of each month. */
export function nextPanelMeeting(from: Date): Date {
  const firstTuesday = (year: number, month: number) => {
    const d = new Date(year, month, 1);
    d.setDate(1 + ((2 - d.getDay() + 7) % 7));
    return d;
  };
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const thisMonth = firstTuesday(from.getFullYear(), from.getMonth());
  return thisMonth >= today ? thisMonth : firstTuesday(from.getFullYear(), from.getMonth() + 1);
}

export const quarterStart = (now: Date) => new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

/** Most-backed ideas by votes cast this quarter. Confidential ideas never appear, whoever is looking. */
export function leaderboard(state: AppState, now: Date, limit = 10) {
  const since = quarterStart(now).toISOString();
  return state.ideas
    .filter((i) => !i.confidential)
    .map((idea) => ({ idea, votes: idea.votes.filter((v) => v.at >= since).length }))
    .filter((row) => row.votes > 0)
    .sort((a, b) => b.votes - a.votes || a.idea.title.localeCompare(b.idea.title))
    .slice(0, limit);
}

/** Ideas a colleague might be duplicating: same category first, then shared words in the title. */
export function similarIdeas(state: AppState, c: Colleague, categoryId: string, title: string, excludeId?: string) {
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  return visibleIdeas(state, c)
    .filter((i) => i.id !== excludeId)
    .map((idea) => {
      const text = `${idea.title} ${idea.problem}`.toLowerCase();
      const overlap = words.filter((w) => text.includes(w)).length;
      return { idea, score: overlap * 2 + (idea.categoryId === categoryId ? 1 : 0) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => row.idea);
}
