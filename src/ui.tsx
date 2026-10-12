import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as actions from './domain/actions';
import { CRITERIA, STAGE_LABEL, pilotStatus, voteBlocker } from './domain/rules';
import type { AppState, CriterionKey, Idea, Stage } from './domain/types';
import { useApp } from './store';

export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const nameOf = (state: AppState, id: string | undefined) =>
  state.colleagues.find((c) => c.id === id)?.name ?? 'A former colleague';

export const categoryOf = (state: AppState, id: string) =>
  state.categories.find((k) => k.id === id)?.name ?? 'Uncategorised';

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={`badge stage-${stage}`}>{STAGE_LABEL[stage]}</span>;
}

/**
 * An idea is only ever in one stage. Once pilot results are in, the Piloting badge
 * carries the status "Results in, awaiting panel" inside the same badge.
 */
export function IdeaStage({ idea }: { idea: Idea }) {
  const status = pilotStatus(idea);
  if (!status) return <StageBadge stage={idea.stage} />;
  return (
    <span className={`badge stage-${idea.stage}`}>
      {STAGE_LABEL[idea.stage]}: {status.charAt(0).toLowerCase() + status.slice(1)}
    </span>
  );
}

export function ConfidentialTag() {
  return (
    <span className="badge confidential" title="Only the submitter, the innovation panel and an assigned pilot owner can see this idea.">
      Confidential
    </span>
  );
}

export function PageHeader({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {intro && <p className="intro">{intro}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function NoAccess({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card narrow">
      <h1>{title}</h1>
      <p>{children}</p>
      <Link to="/">Back to all ideas</Link>
    </div>
  );
}

export function VoteButton({ idea }: { idea: Idea }) {
  const { me, run } = useApp();
  const voted = idea.votes.some((v) => v.colleagueId === me.id);
  const blocker = voteBlocker(me, idea);
  // Own ideas and ideas with a final outcome show the total but cannot be voted on.
  if (blocker)
    return (
      <div className="vote static" title={blocker}>
        <span className="vote-count">{idea.votes.length}</span>
        <span className="vote-label">{idea.votes.length === 1 ? 'vote' : 'votes'}</span>
      </div>
    );
  return (
    <button
      type="button"
      className={`vote ${voted ? 'voted' : ''}`}
      aria-pressed={voted}
      title={voted ? 'Remove your vote' : 'Vote for this idea'}
      onClick={() => run((s) => actions.setVote(s, me.id, idea.id, !voted))}
    >
      <span className="vote-count">{idea.votes.length}</span>
      <span className="vote-label">{voted ? 'Backed' : 'Back'}</span>
    </button>
  );
}

export function IdeaCard({ idea }: { idea: Idea }) {
  const { state } = useApp();
  return (
    <article className="idea-card">
      <VoteButton idea={idea} />
      <div className="idea-card-body">
        <h2>
          <Link to={`/ideas/${idea.id}`}>{idea.title}</Link>
        </h2>
        <p className="clamp">{idea.problem}</p>
        <p className="meta">
          <IdeaStage idea={idea} />
          {idea.confidential && <ConfidentialTag />}
          <span>{categoryOf(state, idea.categoryId)}</span>
          <span>
            {nameOf(state, idea.submitterId)}, {idea.office}
          </span>
        </p>
      </div>
    </article>
  );
}

/**
 * A problem with one field, shown at that field. Every form uses this for missing or
 * invalid input; toasts are kept for confirmations and for actions a rule does not allow.
 */
export function FieldError({ show, children }: { show: boolean; children: ReactNode }) {
  return show ? <span className="error-text">Error: {children}</span> : null;
}

export const ratingsComplete = (values: Record<CriterionKey, number>) => CRITERIA.every((c) => values[c.key] >= 1);

/** Three 1 to 5 ratings, used for panel scores and for pilot results. */
export function RatingFields({
  values,
  onChange,
  idPrefix,
  showErrors = false,
}: {
  values: Record<CriterionKey, number>;
  onChange: (next: Record<CriterionKey, number>) => void;
  idPrefix: string;
  showErrors?: boolean;
}) {
  return (
    <div className="ratings">
      {CRITERIA.map((c) => (
        <fieldset key={c.key} className="rating">
          <legend>{c.label}</legend>
          <div className="rating-options">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={values[c.key] === n ? 'selected' : ''}>
                <input
                  type="radio"
                  name={`${idPrefix}-${c.key}`}
                  checked={values[c.key] === n}
                  onChange={() => onChange({ ...values, [c.key]: n })}
                />
                {n}
              </label>
            ))}
          </div>
          <span className="hint">{c.hint}</span>
          <FieldError show={showErrors && !values[c.key]}>please choose a score from 1 to 5.</FieldError>
        </fieldset>
      ))}
    </div>
  );
}

/** A horizontal bar chart in brand tones only. */
export function Bars({ rows, tone = 'navy' }: { rows: { label: string; value: number; note?: string }[]; tone?: 'navy' | 'copper' | 'grey' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <table className="bars">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td className="bar-cell">
              <div className={`bar ${tone}`} style={{ width: `${(r.value / max) * 100}%` }} />
            </td>
            <td className="bar-value">
              {r.value}
              {r.note && <span className="hint"> {r.note}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
