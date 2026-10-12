import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as actions from '../domain/actions';
import {
  CRITERIA,
  STAGE_LABEL,
  TRANSITIONS,
  adminRemoveCommentBlocker,
  averageScores,
  canSeePreviousVersions,
  canViewIdea,
  confidentialityBlocker,
  decisionBlocker,
  editBlocker,
  isPilotOwner,
  isSubmitter,
  ownCommentBlocker,
  pilotResultBlocker,
  pilotStatus,
  reassignPilotBlocker,
  resubmitBlocker,
  scoreBlocker,
  scoreView,
} from '../domain/rules';
import type { CriterionKey, Decision, Idea, Score, Stage } from '../domain/types';
import { useApp } from '../store';
import {
  ConfidentialTag,
  FieldError,
  IdeaStage,
  NoAccess,
  RatingFields,
  VoteButton,
  categoryOf,
  fmtDate,
  nameOf,
  plural,
  ratingsComplete,
} from '../ui';

const NO_RATINGS: Record<CriterionKey, number> = { impact: 0, cost: 0, feasibility: 0 };

export default function IdeaPage() {
  const { id } = useParams();
  const { state, me } = useApp();
  const idea = state.ideas.find((i) => i.id === id);

  // A confidential idea must look exactly like one that does not exist.
  if (!idea || !canViewIdea(me, idea))
    return <NoAccess title="Idea not found">This idea does not exist or is not available to you.</NoAccess>;

  const mine = isSubmitter(me, idea);

  return (
    <article>
      <Link to="/" className="back-link">
        All ideas
      </Link>
      <header className="idea-header">
        <VoteButton idea={idea} />
        <div>
          <h1>{idea.title}</h1>
          <p className="meta">
            <IdeaStage idea={idea} />
            {idea.confidential && <ConfidentialTag />}
            <span>{categoryOf(state, idea.categoryId)}</span>
            <span>{idea.office}</span>
            <span>
              {mine ? 'Your idea' : nameOf(state, idea.submitterId)}, {fmtDate(idea.createdAt)}
            </span>
          </p>
        </div>
      </header>

      {mine && <SubmitterControls idea={idea} />}

      <div className="two-col">
        <div className="stack">
          <section className="card idea-body">
            <h2>The problem it solves</h2>
            <p className="prose">{idea.problem}</p>
            <h2>Proposed solution</h2>
            <p className="prose">{idea.solution}</p>
            <h2>Expected impact</h2>
            <p className="prose">{idea.expectedImpact}</p>
          </section>

          {me.isReviewer && <PanelActions idea={idea} />}
          <ScoreSection idea={idea} />
          <PilotSection idea={idea} />
          {canSeePreviousVersions(me, idea) && idea.previousVersions.length > 0 && <PreviousVersions idea={idea} />}
          <Comments idea={idea} />
        </div>

        <aside className="card side">
          <h2>Progress</h2>
          <Timeline idea={idea} />
        </aside>
      </div>
    </article>
  );
}

function SubmitterControls({ idea }: { idea: Idea }) {
  const { me, run } = useApp();
  const navigate = useNavigate();
  const canEdit = !editBlocker(me, idea);
  const canResubmit = !resubmitBlocker(me, idea);
  const canMakePublic = idea.confidential && !confidentialityBlocker(me, idea, false);

  const hint = canEdit
    ? 'You can edit or withdraw this idea until the panel starts its review.'
    : canResubmit
      ? 'You can improve this idea and resubmit it once.'
      : idea.stage === 'declined'
        ? 'This idea has already been resubmitted once.'
        : null;

  if (!hint && idea.confidential && !canMakePublic) return null;

  return (
    <div className="owner-bar">
      {hint && <span className="hint">{hint}</span>}
      <div className="owner-actions">
        {canResubmit && (
          <Link className="button small primary" to={`/ideas/${idea.id}/resubmit`}>
            Improve and resubmit
          </Link>
        )}
        {canEdit && (
          <>
            <Link className="button small" to={`/ideas/${idea.id}/edit`}>
              Edit
            </Link>
            <button
              type="button"
              className="button small"
              onClick={() => {
                if (!window.confirm('Withdraw this idea? It will be removed from the pipeline.')) return;
                if (run((s) => actions.withdrawIdea(s, me.id, idea.id), 'Your idea has been withdrawn.')) navigate('/mine');
              }}
            >
              Withdraw
            </button>
          </>
        )}
        {!idea.confidential && (
          <button
            type="button"
            className="button small"
            onClick={() =>
              window.confirm(
                'Make this idea confidential? Other colleagues will no longer be able to see, back or comment on it. You can only make it public again while it is still Submitted.',
              ) && run((s) => actions.setConfidential(s, me.id, idea.id, true), 'Your idea is now confidential and hidden from other colleagues.')
            }
          >
            Make confidential
          </button>
        )}
        {canMakePublic && (
          <button
            type="button"
            className="button small"
            onClick={() =>
              window.confirm('Make this idea public? All colleagues will be able to see it.') &&
              run((s) => actions.setConfidential(s, me.id, idea.id, false), 'Your idea is now public.')
            }
          >
            Make public
          </button>
        )}
      </div>
    </div>
  );
}

function entryTitle(d: Decision): string {
  if (d.kind === 'reassignment') return 'Pilot owner changed';
  return d.from === d.to ? `Kept ${STAGE_LABEL[d.to].toLowerCase()}` : `Moved to ${STAGE_LABEL[d.to]}`;
}

function Timeline({ idea }: { idea: Idea }) {
  const { state, me } = useApp();
  const status = pilotStatus(idea);
  return (
    <ol className="timeline">
      <li>
        <strong>Submitted</strong>
        <span className="hint">{fmtDate(idea.createdAt)}</span>
      </li>
      {idea.decisions.map((d) => (
        <li key={d.id}>
          <strong>{entryTitle(d)}</strong>
          <span className="hint">{fmtDate(d.at)}</span>
          <p className="reason">{d.reason}</p>
          {me.isReviewer && <span className="hint">Recorded for the panel by {nameOf(state, d.recordedById)}</span>}
        </li>
      ))}
      {idea.resubmissions > 0 && idea.stage === 'submitted' && (
        <li>
          <strong>Resubmitted with improvements</strong>
          <span className="hint">{fmtDate(idea.stageEnteredAt)}</span>
        </li>
      )}
      {status && idea.pilotResult && (
        <li>
          <strong>{status}</strong>
          <span className="hint">{fmtDate(idea.pilotResult.at)}</span>
        </li>
      )}
    </ol>
  );
}

function ScoreTable({ scores, named }: { scores: Score[]; named: boolean }) {
  const { state } = useApp();
  const avg = averageScores(scores);
  if (!avg) return <p className="hint">No scores have been entered yet.</p>;
  const notes = scores.filter((s) => s.note);
  return (
    <>
      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{named ? 'Reviewer' : ''}</th>
              {CRITERIA.map((c) => (
                <th scope="col" key={c.key} className="num">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scores.map((s, n) => (
              <tr key={s.reviewerId}>
                <th scope="row">{named ? nameOf(state, s.reviewerId) : `Reviewer ${n + 1}`}</th>
                {CRITERIA.map((c) => (
                  <td key={c.key} className="num">
                    {s[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="total">
              <th scope="row">Panel average ({plural(scores.length, 'reviewer')})</th>
              {CRITERIA.map((c) => (
                <td key={c.key} className="num">
                  {avg[c.key].toFixed(1)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {notes.length > 0 && (
        <>
          <h3>Reviewer feedback</h3>
          <ul className="plain feedback">
            {notes.map((s) => (
              <li key={s.reviewerId}>
                {s.note}
                {named && <span className="hint"> {nameOf(state, s.reviewerId)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ScoreSection({ idea }: { idea: Idea }) {
  const { me } = useApp();
  const view = scoreView(me, idea);
  const avg = averageScores(idea.scores);
  // Nothing to show until someone has scored. Reviewers who still need to score see that in their own panel card.
  if (!avg || view === 'hidden') return null;

  return (
    <section className="card">
      <h2>Panel scores</h2>
      <div className="stats">
        {CRITERIA.map((c) => (
          <div className="stat" key={c.key}>
            <span className="stat-value">{avg[c.key].toFixed(1)}</span>
            <span className="stat-label">{c.label}</span>
          </div>
        ))}
      </div>
      <p className="hint">
        Average of {plural(idea.scores.length, 'reviewer')}, out of 5. For cost, 5 means cheap. Scores inform the
        panel's discussion; they do not decide the outcome.
      </p>
      <details>
        <summary>Individual scores and feedback</summary>
        <ScoreTable scores={idea.scores} named={view === 'named'} />
      </details>
    </section>
  );
}

function PilotSection({ idea }: { idea: Idea }) {
  const { state, me, run } = useApp();
  const [ratings, setRatings] = useState(NO_RATINGS);
  const [summary, setSummary] = useState('');
  const [tried, setTried] = useState(false);
  if (!idea.pilotOwnerId) return null;

  // The panel's expectations are hidden from a reviewer who has not scored yet, like the scores themselves.
  const expected = scoreView(me, idea) === 'hidden' ? null : averageScores(idea.scores);
  const result = idea.pilotResult;
  const canSubmit = !pilotResultBlocker(me, idea);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!ratingsComplete(ratings) || !summary.trim()) return;
    run(
      (s) => actions.submitPilotResult(s, me.id, idea.id, ratings, summary),
      'Your pilot results have been submitted. The idea will be discussed at the next panel meeting.',
    );
  }

  return (
    <section className="card">
      <h2>Pilot</h2>
      <p>
        Led by <strong>{isPilotOwner(me, idea) ? 'you' : nameOf(state, idea.pilotOwnerId)}</strong>
        {!result && idea.stage === 'piloting' && '. Results not in yet.'}
      </p>

      {(result || canSubmit) && (
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th scope="col"></th>
                {CRITERIA.map((c) => (
                  <th scope="col" key={c.key} className="num">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Expected (panel average)</th>
                {CRITERIA.map((c) => (
                  <td key={c.key} className="num">
                    {expected ? expected[c.key].toFixed(1) : 'n/a'}
                  </td>
                ))}
              </tr>
              {result && (
                <tr className="total">
                  <th scope="row">Actual (pilot owner)</th>
                  {CRITERIA.map((c) => (
                    <td key={c.key} className="num">
                      {result[c.key]}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <>
          <h3>Final results, submitted {fmtDate(result.at)}</h3>
          <p className="prose">{result.summary}</p>
        </>
      )}


      {canSubmit && (
        <form className="form" onSubmit={submit}>
          <h3>Submit final pilot results</h3>
          <p className="hint">Rate what actually happened. The panel then decides the outcome at its next meeting.</p>
          <RatingFields values={ratings} onChange={setRatings} idPrefix="pilot" showErrors={tried} />
          <div className={`field ${tried && !summary.trim() ? 'invalid' : ''}`}>
            <label htmlFor="pilot-summary">Brief summary</label>
            <span className="hint">How did the actual impact, cost and feasibility compare with what was expected?</span>
            <textarea id="pilot-summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
            <FieldError show={tried && !summary.trim()}>please add a brief summary.</FieldError>
          </div>
          <button type="submit" className="button primary">
            Submit final results
          </button>
        </form>
      )}
    </section>
  );
}

function PanelActions({ idea }: { idea: Idea }) {
  const { state, me, run } = useApp();
  const myScore = idea.scores.find((s) => s.reviewerId === me.id);
  const [ratings, setRatings] = useState<Record<CriterionKey, number>>(
    myScore ? { impact: myScore.impact, cost: myScore.cost, feasibility: myScore.feasibility } : NO_RATINGS,
  );
  const [note, setNote] = useState(myScore?.note ?? '');
  const [to, setTo] = useState<Stage | ''>('');
  const [reason, setReason] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [scoreTried, setScoreTried] = useState(false);
  const [decisionTried, setDecisionTried] = useState(false);
  const [reassignTried, setReassignTried] = useState(false);

  const scoreBlock = scoreBlocker(me, idea);
  const decisionBlock = decisionBlocker(me, idea);
  const canReassign = !reassignPilotBlocker(me, idea);
  const own = isSubmitter(me, idea);
  const others = idea.scores.filter((s) => s.reviewerId !== me.id).length;
  const options = TRANSITIONS[idea.stage];
  const label = (s: Stage) => (s === idea.stage ? `Keep ${STAGE_LABEL[s].toLowerCase()}` : `Move to ${STAGE_LABEL[s]}`);

  // Only show what this reviewer can act on now. A blocked step appears as one line, or not at all.
  const notes = [
    own && scoreBlock,
    !scoreBlock && !myScore && others > 0 && `${plural(others, 'reviewer')} ${others === 1 ? 'has' : 'have'} scored. You will see their scores once you have saved yours.`,
    idea.stage === 'piloting' && decisionBlock,
  ].filter(Boolean) as string[];

  if (scoreBlock && decisionBlock && !canReassign && notes.length === 0) return null;

  function saveScore(e: FormEvent) {
    e.preventDefault();
    setScoreTried(true);
    if (!ratingsComplete(ratings)) return;
    if (run((s) => actions.saveScore(s, me.id, idea.id, ratings, note), 'Your score has been saved.')) setScoreTried(false);
  }

  function saveDecision(e: FormEvent) {
    e.preventDefault();
    setDecisionTried(true);
    if (!to || !reason.trim() || (to === 'piloting' && !ownerId)) return;
    const ok = run(
      (s) => actions.recordDecision(s, me.id, idea.id, to, reason, ownerId || undefined),
      to === idea.stage ? 'The panel decision has been recorded.' : 'The panel decision has been recorded and the submitter has been notified.',
    );
    if (ok) {
      setTo('');
      setReason('');
      setOwnerId('');
      setDecisionTried(false);
    }
  }

  function reassign(e: FormEvent) {
    e.preventDefault();
    setReassignTried(true);
    if (!newOwnerId || !reassignReason.trim()) return;
    const ok = run(
      (s) => actions.reassignPilot(s, me.id, idea.id, newOwnerId, reassignReason),
      'The pilot owner has been changed and the new owner has been notified.',
    );
    if (ok) {
      setNewOwnerId('');
      setReassignReason('');
      setReassignTried(false);
    }
  }

  const colleagueOptions = (exceptId?: string) =>
    state.colleagues
      .filter((c) => c.id !== exceptId)
      .map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.office}){c.id === idea.submitterId ? ', submitter' : ''}
        </option>
      ));

  return (
    <section className="card">
      <h2>
        Panel <span className="hint">Reviewers only</span>
      </h2>
      {notes.map((n) => (
        <p className="hint" key={n}>
          {n}
        </p>
      ))}

      {!scoreBlock && (
        <details open={!myScore}>
          <summary>
            Your score
            <span className="summary-note">
              {myScore ? `Impact ${myScore.impact}, cost ${myScore.cost}, feasibility ${myScore.feasibility}` : 'Not scored yet'}
            </span>
          </summary>
          <form className="form" onSubmit={saveScore}>
            <RatingFields values={ratings} onChange={setRatings} idPrefix="score" showErrors={scoreTried} />
            <div className="field">
              <label htmlFor="score-note">Feedback (optional)</label>
              <span className="hint">Shown on the idea without your name.</span>
              <textarea id="score-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button type="submit" className="button primary">
              {myScore ? 'Update score' : 'Save score'}
            </button>
          </form>
        </details>
      )}

      {!decisionBlock && (
        <details>
          <summary>Record the panel's decision</summary>
          <form className="form" onSubmit={saveDecision}>
            <p className="hint">Record what the panel agreed together. The reason is shown on the idea.</p>
            <div className={`field ${decisionTried && !to ? 'invalid' : ''}`}>
              <label htmlFor="decision-to">Agreed outcome</label>
              <select id="decision-to" value={to} onChange={(e) => setTo(e.target.value as Stage | '')}>
                <option value="">Choose an outcome</option>
                {options.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
              <FieldError show={decisionTried && !to}>please choose an outcome.</FieldError>
            </div>
            {to === 'piloting' && (
              <div className={`field ${decisionTried && !ownerId ? 'invalid' : ''}`}>
                <label htmlFor="decision-owner">Pilot owner</label>
                {idea.confidential && <span className="hint">They will be given access to this confidential idea, and no other.</span>}
                <select id="decision-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                  <option value="">Choose a colleague</option>
                  {colleagueOptions()}
                </select>
                <FieldError show={decisionTried && !ownerId}>please choose a pilot owner.</FieldError>
              </div>
            )}
            <div className={`field ${decisionTried && !reason.trim() ? 'invalid' : ''}`}>
              <label htmlFor="decision-reason">Reason</label>
              <textarea id="decision-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              <FieldError show={decisionTried && !reason.trim()}>please give the panel's reason.</FieldError>
            </div>
            <button type="submit" className="button primary">
              Record decision
            </button>
          </form>
        </details>
      )}

      {canReassign && (
        <details>
          <summary>Change the pilot owner</summary>
          <form className="form" onSubmit={reassign}>
            {idea.confidential && <p className="hint">The previous owner will lose access to this confidential idea.</p>}
            <div className={`field ${reassignTried && !newOwnerId ? 'invalid' : ''}`}>
              <label htmlFor="reassign-owner">New pilot owner</label>
              <select id="reassign-owner" value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)}>
                <option value="">Choose a colleague</option>
                {colleagueOptions(idea.pilotOwnerId)}
              </select>
              <FieldError show={reassignTried && !newOwnerId}>please choose the new pilot owner.</FieldError>
            </div>
            <div className={`field ${reassignTried && !reassignReason.trim() ? 'invalid' : ''}`}>
              <label htmlFor="reassign-reason">Reason</label>
              <textarea id="reassign-reason" rows={2} value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} />
              <FieldError show={reassignTried && !reassignReason.trim()}>please give a reason.</FieldError>
            </div>
            <button type="submit" className="button">
              Change pilot owner
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

function PreviousVersions({ idea }: { idea: Idea }) {
  const { me } = useApp();
  return (
    <section className="card">
      <h2>Earlier version of this idea</h2>
      {idea.previousVersions.map((v) => (
        <details key={v.declinedAt}>
          <summary>
            "{v.content.title}", declined on {fmtDate(v.declinedAt)}
          </summary>
          <h3>Reason for declining</h3>
          <p className="prose">{v.declineReason}</p>
          <h3>The problem it solves</h3>
          <p className="prose">{v.content.problem}</p>
          <h3>Proposed solution</h3>
          <p className="prose">{v.content.solution}</p>
          <h3>Expected impact</h3>
          <p className="prose">{v.content.expectedImpact}</p>
          <h3>Scores at the time</h3>
          <ScoreTable scores={v.scores} named={me.isReviewer && !isSubmitter(me, idea)} />
        </details>
      ))}
    </section>
  );
}

function Comments({ idea }: { idea: Idea }) {
  const { state, me, run } = useApp();
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [tried, setTried] = useState(false);
  const [editTried, setEditTried] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!text.trim()) return;
    if (run((s) => actions.addComment(s, me.id, idea.id, text))) {
      setText('');
      setTried(false);
    }
  }

  function saveEdit(e: FormEvent, commentId: string) {
    e.preventDefault();
    setEditTried(true);
    if (!draft.trim()) return;
    if (run((s) => actions.editComment(s, me.id, idea.id, commentId, draft), 'Your comment has been updated.')) setEditingId(null);
  }

  return (
    <section className="card">
      <h2>Comments ({idea.comments.length})</h2>
      <ul className="plain comments">
        {idea.comments.map((c) => {
          if (c.removedByAdmin)
            return (
              <li key={c.id}>
                <p className="removed">Removed by Admin</p>
              </li>
            );
          const own = !ownCommentBlocker(me, idea, c);
          const canRemove = !own && !adminRemoveCommentBlocker(me, idea, c);
          return (
            <li key={c.id}>
              <p className="comment-head">
                <strong>{nameOf(state, c.authorId)}</strong>
                {c.authorId === idea.submitterId && <span className="badge">Submitter</span>}
                <span className="hint">
                  {fmtDate(c.at)}
                  {c.editedAt && ' (edited)'}
                </span>
              </p>
              {editingId === c.id ? (
                <form className="form" onSubmit={(e) => saveEdit(e, c.id)}>
                  <div className="field">
                    <label htmlFor={`edit-${c.id}`}>Edit your comment</label>
                    <textarea id={`edit-${c.id}`} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
                    <FieldError show={editTried && !draft.trim()}>a comment cannot be empty.</FieldError>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="button primary">
                      Save comment
                    </button>
                    <button type="button" className="button" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="prose">{c.text}</p>
                  {(own || canRemove) && (
                    <p className="row-actions">
                      {own && (
                        <>
                          <button
                            type="button"
                            className="link"
                            onClick={() => {
                              setEditingId(c.id);
                              setDraft(c.text);
                              setEditTried(false);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="link"
                            onClick={() =>
                              window.confirm('Delete your comment?') &&
                              run((s) => actions.deleteComment(s, me.id, idea.id, c.id), 'Your comment has been deleted.')
                            }
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {canRemove && (
                        <button
                          type="button"
                          className="link"
                          onClick={() =>
                            window.confirm('Remove this comment? It will show as "Removed by Admin".') &&
                            run((s) => actions.removeCommentAsAdmin(s, me.id, idea.id, c.id), 'The comment has been removed.')
                          }
                        >
                          Remove as Admin
                        </button>
                      )}
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      <form className="form" onSubmit={submit}>
        <div className={`field ${tried && !text.trim() ? 'invalid' : ''}`}>
          <label htmlFor="comment" className="visually-hidden">
            Add a comment
          </label>
          <textarea id="comment" rows={2} placeholder="Ask a question or share your experience" value={text} onChange={(e) => setText(e.target.value)} />
          <FieldError show={tried && !text.trim()}>please write a comment before posting.</FieldError>
        </div>
        <button type="submit" className="button">
          Post comment
        </button>
      </form>
    </section>
  );
}
