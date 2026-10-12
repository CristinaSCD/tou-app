import type { AppState, Colleague, CriterionKey, Idea, IdeaContent, Stage } from './types';
import {
  CRITERIA,
  STAGE_LABEL,
  adminRemoveCommentBlocker,
  canAdminister,
  canViewIdea,
  commentBlocker,
  confidentialityBlocker,
  decisionBlocker,
  editBlocker,
  ownCommentBlocker,
  pilotResultBlocker,
  reassignPilotBlocker,
  resubmitBlocker,
  scoreBlocker,
  voteBlocker,
} from './rules';

/**
 * Every change to the data goes through one of these functions. Each one takes
 * the acting colleague, checks the rules, and throws a RuleError if the action
 * is not allowed. They are pure (state in, new state out) so they can be unit
 * tested and later moved behind a server without changing the rules.
 */

export class RuleError extends Error {}

function fail(message: string): never {
  throw new RuleError(message);
}

const uid = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();

function actor(state: AppState, id: string): Colleague {
  return state.colleagues.find((c) => c.id === id) ?? fail('Colleague not found.');
}

/** Looks up an idea as the acting colleague. A hidden idea behaves exactly like a missing one. */
function ideaFor(state: AppState, me: Colleague, ideaId: string): Idea {
  const idea = state.ideas.find((i) => i.id === ideaId);
  if (!idea || !canViewIdea(me, idea)) return fail('This idea is not available.');
  return idea;
}

function check(blocker: string | null) {
  if (blocker) fail(blocker);
}

const patch = (state: AppState, ideaId: string, fn: (idea: Idea) => Idea): AppState => ({
  ...state,
  ideas: state.ideas.map((i) => (i.id === ideaId ? fn(i) : i)),
});

function notify(state: AppState, toIds: string[], ideaId: string, text: string, at: string, exceptId?: string): AppState {
  const ids = [...new Set(toIds)].filter((id) => id !== exceptId);
  const added = ids.map((toId) => ({ id: uid(), toId, ideaId, text, at, read: false }));
  return { ...state, notifications: [...added, ...state.notifications] };
}

const FIELD_LABELS: [keyof IdeaContent, string][] = [
  ['title', 'title'],
  ['problem', 'the problem it solves'],
  ['solution', 'proposed solution'],
  ['categoryId', 'category'],
  ['expectedImpact', 'expected impact'],
];

function cleanContent(state: AppState, content: IdeaContent): IdeaContent {
  const out: IdeaContent = {
    title: content.title.trim(),
    problem: content.problem.trim(),
    solution: content.solution.trim(),
    categoryId: content.categoryId,
    expectedImpact: content.expectedImpact.trim(),
  };
  const missing = FIELD_LABELS.filter(([key]) => !out[key]).map(([, label]) => label);
  if (missing.length) fail(`Please complete: ${missing.join(', ')}.`);
  if (!state.categories.some((k) => k.id === out.categoryId && k.active))
    fail('Please choose a category from the list.');
  return out;
}

const isRating = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;

/** Names exactly which of the three ratings is missing or outside 1 to 5. */
function checkRatings(ratings: Record<CriterionKey, number>) {
  const bad = CRITERIA.filter((c) => !isRating(ratings[c.key])).map((c) => c.label.toLowerCase());
  if (bad.length) fail(`Nothing was saved. Please choose a score from 1 to 5 for: ${bad.join(', ')}.`);
}

function commentFor(idea: Idea, commentId: string) {
  return idea.comments.find((c) => c.id === commentId) ?? fail('This comment is no longer available.');
}

// ---- Colleagues: ideas ----------------------------------------------------

export function submitIdea(
  state: AppState,
  actorId: string,
  content: IdeaContent,
  confidential: boolean,
  at = nowIso(),
): { state: AppState; ideaId: string } {
  const me = actor(state, actorId);
  const idea: Idea = {
    ...cleanContent(state, content),
    id: `idea-${uid()}`,
    confidential,
    submitterId: me.id,
    office: me.office,
    stage: 'submitted',
    createdAt: at,
    stageEnteredAt: at,
    votes: [],
    comments: [],
    scores: [],
    decisions: [],
    resubmissions: 0,
    previousVersions: [],
  };
  return { state: { ...state, ideas: [idea, ...state.ideas] }, ideaId: idea.id };
}

export function editIdea(state: AppState, actorId: string, ideaId: string, content: IdeaContent): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(editBlocker(me, idea));
  const cleaned = cleanContent(state, content);
  return patch(state, ideaId, (i) => ({ ...i, ...cleaned }));
}

export function withdrawIdea(state: AppState, actorId: string, ideaId: string): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(editBlocker(me, idea));
  return {
    ...state,
    ideas: state.ideas.filter((i) => i.id !== ideaId),
    notifications: state.notifications.filter((n) => n.ideaId !== ideaId),
  };
}

export function resubmitIdea(state: AppState, actorId: string, ideaId: string, content: IdeaContent, at = nowIso()): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(resubmitBlocker(me, idea));
  const cleaned = cleanContent(state, content);
  const lastDecline = [...idea.decisions].reverse().find((d) => d.to === 'declined');
  return patch(state, ideaId, (i) => ({
    ...i,
    ...cleaned,
    stage: 'submitted',
    stageEnteredAt: at,
    resubmissions: i.resubmissions + 1,
    scores: [],
    pilotOwnerId: undefined,
    pilotResult: undefined,
    previousVersions: [
      ...i.previousVersions,
      {
        content: {
          title: i.title,
          problem: i.problem,
          solution: i.solution,
          categoryId: i.categoryId,
          expectedImpact: i.expectedImpact,
        },
        scores: i.scores,
        declineReason: lastDecline?.reason ?? '',
        declinedAt: lastDecline?.at ?? i.stageEnteredAt,
      },
    ],
  }));
}

/**
 * Adds or removes the acting colleague's vote. The request says which state is wanted,
 * so the same request arriving twice (for example from two devices) still leaves one vote.
 */
export function setVote(state: AppState, actorId: string, ideaId: string, voted: boolean, at = nowIso()): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(voteBlocker(me, idea));
  const hasVoted = idea.votes.some((v) => v.colleagueId === me.id);
  if (hasVoted === voted) return state;
  return patch(state, ideaId, (i) => ({
    ...i,
    votes: voted ? [...i.votes, { colleagueId: me.id, at }] : i.votes.filter((v) => v.colleagueId !== me.id),
  }));
}

export function setConfidential(state: AppState, actorId: string, ideaId: string, confidential: boolean): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(confidentialityBlocker(me, idea, confidential));
  return patch(state, ideaId, (i) => ({ ...i, confidential }));
}

export function addComment(state: AppState, actorId: string, ideaId: string, text: string, at = nowIso()): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(commentBlocker(me, idea));
  const body = text.trim();
  if (!body) fail('Please write a comment before posting.');
  const next = patch(state, ideaId, (i) => ({
    ...i,
    comments: [...i.comments, { id: uid(), authorId: me.id, text: body, at }],
  }));
  // The submitter and anyone already in the discussion, as long as they can still see the idea.
  const involved = [idea.submitterId, ...idea.comments.map((c) => c.authorId)].filter((id) => {
    const colleague = state.colleagues.find((c) => c.id === id);
    return colleague && canViewIdea(colleague, idea);
  });
  return notify(next, involved, ideaId, `${me.name} commented on "${idea.title}".`, at, me.id);
}

export function editComment(state: AppState, actorId: string, ideaId: string, commentId: string, text: string, at = nowIso()): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(ownCommentBlocker(me, idea, commentFor(idea, commentId)));
  const body = text.trim();
  if (!body) fail('A comment cannot be empty. Delete it instead if you no longer want it shown.');
  return patch(state, ideaId, (i) => ({
    ...i,
    comments: i.comments.map((c) => (c.id === commentId ? { ...c, text: body, editedAt: at } : c)),
  }));
}

export function deleteComment(state: AppState, actorId: string, ideaId: string, commentId: string): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(ownCommentBlocker(me, idea, commentFor(idea, commentId)));
  return patch(state, ideaId, (i) => ({ ...i, comments: i.comments.filter((c) => c.id !== commentId) }));
}

/** The comment stays in the discussion as "Removed by Admin"; its text is not kept. */
export function removeCommentAsAdmin(state: AppState, actorId: string, ideaId: string, commentId: string): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(adminRemoveCommentBlocker(me, idea, commentFor(idea, commentId)));
  return patch(state, ideaId, (i) => ({
    ...i,
    comments: i.comments.map((c) => (c.id === commentId ? { ...c, text: '', removedByAdmin: true } : c)),
  }));
}

// ---- Innovation panel -----------------------------------------------------

export function saveScore(
  state: AppState,
  actorId: string,
  ideaId: string,
  ratings: Record<CriterionKey, number>,
  note: string,
  at = nowIso(),
): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(scoreBlocker(me, idea));
  checkRatings(ratings);
  const score = { reviewerId: me.id, ...ratings, note: note.trim(), at };
  return patch(state, ideaId, (i) => ({
    ...i,
    scores: [...i.scores.filter((s) => s.reviewerId !== me.id), score],
  }));
}

/**
 * Records the stage the panel agreed collectively. Scores are never consulted
 * here: they inform the discussion but do not decide the outcome.
 */
export function recordDecision(
  state: AppState,
  actorId: string,
  ideaId: string,
  to: Stage,
  reason: string,
  pilotOwnerId?: string,
  at = nowIso(),
): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(decisionBlocker(me, idea, to));
  const why = reason.trim();
  if (!why) fail('A written reason is required for every panel decision.');

  let owner: Colleague | undefined;
  if (to === 'piloting') {
    owner = state.colleagues.find((c) => c.id === pilotOwnerId);
    if (!owner) fail('Please choose a pilot owner before moving this idea to Piloting.');
  }

  const kept = to === idea.stage;
  let next = patch(state, ideaId, (i) => ({
    ...i,
    stage: to,
    stageEnteredAt: kept ? i.stageEnteredAt : at,
    pilotOwnerId: owner ? owner.id : i.pilotOwnerId,
    decisions: [...i.decisions, { id: uid(), from: i.stage, to, reason: why, recordedById: me.id, at }],
  }));

  // Stage-change notifications are only sent when the stage actually changes (PRD S2.3).
  if (!kept)
    next = notify(
      next,
      [idea.submitterId],
      ideaId,
      `"${idea.title}" has moved to ${STAGE_LABEL[to]}. You can read the panel's reason on the idea.`,
      at,
      me.id,
    );

  if (owner) {
    const access = idea.confidential ? ' This idea is confidential and you now have access to it.' : '';
    next = notify(next, [owner.id], ideaId, `You have been assigned as pilot owner for "${idea.title}".${access}`, at, me.id);
  }
  return next;
}

/**
 * Hands a pilot to another colleague. The previous owner loses any access the pilot
 * gave them to a confidential idea, and the change is kept in the idea's history.
 */
export function reassignPilot(
  state: AppState,
  actorId: string,
  ideaId: string,
  newOwnerId: string,
  reason: string,
  at = nowIso(),
): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(reassignPilotBlocker(me, idea));
  const owner = state.colleagues.find((c) => c.id === newOwnerId) ?? fail('Please choose the new pilot owner.');
  if (owner.id === idea.pilotOwnerId) fail('That colleague is already the pilot owner.');
  const why = reason.trim();
  if (!why) fail('Please give a reason for changing the pilot owner.');
  const previous = state.colleagues.find((c) => c.id === idea.pilotOwnerId)?.name ?? 'the previous owner';

  const next = patch(state, ideaId, (i) => ({
    ...i,
    pilotOwnerId: owner.id,
    decisions: [
      ...i.decisions,
      {
        id: uid(),
        kind: 'reassignment' as const,
        from: i.stage,
        to: i.stage,
        reason: `Pilot owner changed from ${previous} to ${owner.name}. ${why}`,
        recordedById: me.id,
        at,
      },
    ],
  }));
  const access = idea.confidential ? ' This idea is confidential and you now have access to it.' : '';
  return notify(next, [owner.id], ideaId, `You have been assigned as pilot owner for "${idea.title}".${access}`, at, me.id);
}

// ---- Pilot owner ----------------------------------------------------------

export function submitPilotResult(
  state: AppState,
  actorId: string,
  ideaId: string,
  ratings: Record<CriterionKey, number>,
  summary: string,
  at = nowIso(),
): AppState {
  const me = actor(state, actorId);
  const idea = ideaFor(state, me, ideaId);
  check(pilotResultBlocker(me, idea));
  checkRatings(ratings);
  const text = summary.trim();
  if (!text) fail('Please add a brief summary of the pilot results.');
  const next = patch(state, ideaId, (i) => ({
    ...i,
    pilotResult: { ...ratings, summary: text, submittedById: me.id, at },
  }));
  const panel = state.colleagues.filter((c) => c.isReviewer).map((c) => c.id);
  return notify(
    next,
    [...panel, idea.submitterId],
    ideaId,
    `Final pilot results are in for "${idea.title}". It is ready for the next panel meeting.`,
    at,
    me.id,
  );
}

// ---- Admin ----------------------------------------------------------------

function admin(state: AppState, actorId: string): Colleague {
  const me = actor(state, actorId);
  if (!canAdminister(me)) fail('Only the admin can manage categories and reviewers.');
  return me;
}

function categoryName(state: AppState, name: string, exceptId?: string): string {
  const cleaned = name.trim();
  if (!cleaned) fail('Please give the category a name.');
  if (state.categories.some((k) => k.id !== exceptId && k.name.toLowerCase() === cleaned.toLowerCase()))
    fail('There is already a category with that name.');
  return cleaned;
}

export function addCategory(state: AppState, actorId: string, name: string): AppState {
  admin(state, actorId);
  const cleaned = categoryName(state, name);
  return { ...state, categories: [...state.categories, { id: `cat-${uid()}`, name: cleaned, active: true }] };
}

export function renameCategory(state: AppState, actorId: string, categoryId: string, name: string): AppState {
  admin(state, actorId);
  const cleaned = categoryName(state, name, categoryId);
  return { ...state, categories: state.categories.map((k) => (k.id === categoryId ? { ...k, name: cleaned } : k)) };
}

/** Retired categories stay on existing ideas but cannot be chosen for new ones. */
export function setCategoryActive(state: AppState, actorId: string, categoryId: string, active: boolean): AppState {
  admin(state, actorId);
  if (!active && state.categories.filter((k) => k.active && k.id !== categoryId).length === 0)
    fail('At least one category must stay available.');
  return { ...state, categories: state.categories.map((k) => (k.id === categoryId ? { ...k, active } : k)) };
}

export function setReviewer(state: AppState, actorId: string, colleagueId: string, isReviewer: boolean): AppState {
  admin(state, actorId);
  return { ...state, colleagues: state.colleagues.map((c) => (c.id === colleagueId ? { ...c, isReviewer } : c)) };
}

// ---- Notifications --------------------------------------------------------

export function markNotificationsRead(state: AppState, actorId: string): AppState {
  return { ...state, notifications: state.notifications.map((n) => (n.toId === actorId ? { ...n, read: true } : n)) };
}
