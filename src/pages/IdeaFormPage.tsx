import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as actions from '../domain/actions';
import { TEXT_MAX, TITLE_MAX, canViewIdea, editBlocker, resubmitBlocker, similarIdeas } from '../domain/rules';
import type { IdeaContent } from '../domain/types';
import { useApp } from '../store';
import { IdeaStage, NoAccess, PageHeader } from '../ui';

const EMPTY: IdeaContent = { title: '', problem: '', solution: '', categoryId: '', expectedImpact: '' };

type TextField = Exclude<keyof IdeaContent, 'categoryId'>;
const limitOf = (key: TextField) => (key === 'title' ? TITLE_MAX : TEXT_MAX);

const COPY = {
  new: { title: 'Submit an idea', button: 'Submit idea', done: 'Your idea has been submitted. It will be considered at the next panel meeting.' },
  edit: { title: 'Edit your idea', button: 'Save changes', done: 'Your changes have been saved.' },
  resubmit: { title: 'Improve and resubmit your idea', button: 'Resubmit idea', done: 'Your idea has been resubmitted for one further review.' },
};

export default function IdeaFormPage({ mode }: { mode: 'new' | 'edit' | 'resubmit' }) {
  const { id } = useParams();
  const { state, me, run } = useApp();
  const navigate = useNavigate();
  const existing = mode === 'new' ? undefined : state.ideas.find((i) => i.id === id);

  const [form, setForm] = useState<IdeaContent>(() =>
    existing
      ? {
          title: existing.title,
          problem: existing.problem,
          solution: existing.solution,
          categoryId: existing.categoryId,
          expectedImpact: existing.expectedImpact,
        }
      : EMPTY,
  );
  const [confidential, setConfidential] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // A second click while the first submission is being handled must not create a second idea (PRD M1.6).
  const submitting = useRef(false);

  if (mode !== 'new') {
    if (!existing || !canViewIdea(me, existing))
      return <NoAccess title="Idea not found">This idea does not exist or is not available to you.</NoAccess>;
    const blocker = mode === 'edit' ? editBlocker(me, existing) : resubmitBlocker(me, existing);
    if (blocker)
      return (
        <NoAccess title={COPY[mode].title}>
          {blocker} <Link to={`/ideas/${existing.id}`}>Return to the idea</Link>.
        </NoAccess>
      );
  }

  const missing = (key: keyof IdeaContent) => showErrors && !form[key].trim();
  const tooLong = (key: TextField) => form[key].trim().length > limitOf(key);
  const set = (key: keyof IdeaContent) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const similar = form.categoryId || form.title.trim().length > 3 ? similarIdeas(state, me, form.categoryId, form.title, existing?.id) : [];
  const lastDecline = existing && [...existing.decisions].reverse().find((d) => d.to === 'declined');

  function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if ((Object.keys(EMPTY) as (keyof IdeaContent)[]).some((key) => !form[key].trim())) return;
    if ((['title', 'problem', 'solution', 'expectedImpact'] as TextField[]).some(tooLong)) return;
    if (submitting.current) return;
    submitting.current = true;
    if (mode === 'new') {
      let newId = '';
      const ok = run((s) => {
        const result = actions.submitIdea(s, me.id, form, confidential, anonymous);
        newId = result.ideaId;
        return result.state;
      }, COPY.new.done);
      if (ok) navigate(`/ideas/${newId}`);
      else submitting.current = false;
    } else if (existing) {
      const ok = run(
        (s) => (mode === 'edit' ? actions.editIdea(s, me.id, existing.id, form) : actions.resubmitIdea(s, me.id, existing.id, form)),
        COPY[mode].done,
      );
      if (ok) navigate(`/ideas/${existing.id}`);
      else submitting.current = false;
    }
  }

  const field = (key: TextField, label: string, hint: string, rows?: number) => {
    const length = form[key].trim().length;
    const over = showErrors && tooLong(key);
    const invalid = missing(key) || over;
    return (
      <div className={`field ${invalid ? 'invalid' : ''}`}>
        <label htmlFor={key}>{label}</label>
        {hint && (
          <span className="hint" id={`${key}-hint`}>
            {hint}
          </span>
        )}
        {rows ? (
          <textarea id={key} rows={rows} value={form[key]} onChange={set(key)} aria-describedby={`${key}-hint ${key}-count`} aria-invalid={invalid} />
        ) : (
          <input id={key} type="text" value={form[key]} onChange={set(key)} aria-describedby={`${key}-hint ${key}-count`} aria-invalid={invalid} />
        )}
        {length > limitOf(key) * 0.9 && (
          <span className="hint" id={`${key}-count`}>
            {length.toLocaleString('en-GB')} of {limitOf(key).toLocaleString('en-GB')} characters
          </span>
        )}
        {missing(key) && <span className="error-text">Error: please complete this field.</span>}
        {over && (
          <span className="error-text">Error: please shorten this to {limitOf(key).toLocaleString('en-GB')} characters or fewer.</span>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={COPY[mode].title}
        intro={
          mode === 'new'
            ? 'Every idea is welcome, large or small. It goes straight to the innovation panel.'
            : mode === 'resubmit'
              ? 'You can resubmit once. The panel will see your earlier version alongside this one.'
              : undefined
        }
      />
      <div className="two-col">
        <form className="card form" onSubmit={submit} noValidate>
          {mode === 'resubmit' && lastDecline && (
            <div className="callout">
              <strong>Why the panel declined this idea</strong>
              <p>{lastDecline.reason}</p>
            </div>
          )}
          {field('title', 'Title', '')}
          {field('problem', 'The problem it solves', 'What is not working well today?', 3)}
          {field('solution', 'Proposed solution', 'What would you like us to try?', 3)}
          <div className={`field ${missing('categoryId') ? 'invalid' : ''}`}>
            <label htmlFor="categoryId">Category</label>
            <select id="categoryId" value={form.categoryId} onChange={set('categoryId')} aria-invalid={missing('categoryId')}>
              <option value="">Choose a category</option>
              {state.categories.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            {missing('categoryId') && <span className="error-text">Error: please choose a category.</span>}
          </div>
          {field('expectedImpact', 'Expected impact', 'An estimate is fine.', 2)}

          {mode === 'new' ? (
            <>
              <div className="field checkbox">
                <input id="confidential" type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
                <label htmlFor="confidential">
                  This idea is confidential
                  <span className="hint">
                    For sensitive client or commercial information. Only you, the innovation panel and an assigned pilot
                    owner will see it.
                  </span>
                </label>
              </div>
              <div className="field checkbox">
                <input id="anonymous" type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                <label htmlFor="anonymous">
                  Submit anonymously
                  <span className="hint">
                    Your name will not be shown to anyone, including the innovation panel and the admin. You can still
                    follow the idea and will be notified as usual. You cannot change this later.
                  </span>
                </label>
              </div>
            </>
          ) : (
            <>
              {existing?.confidential && <p className="hint">This idea is confidential. Only you, the innovation panel and an assigned pilot owner can see it.</p>}
              {existing?.anonymous && <p className="hint">This idea was submitted anonymously. Your name is not shown to anyone, and this cannot be changed.</p>}
            </>
          )}

          <div className="form-actions">
            <button type="submit" className="button primary">
              {COPY[mode].button}
            </button>
            <Link className="button" to={existing ? `/ideas/${existing.id}` : '/'}>
              Cancel
            </Link>
          </div>
        </form>

        {similar.length > 0 && (
          <aside className="card side" aria-live="polite">
            <h2>Similar ideas</h2>
            <>
              <p className="hint">Has a colleague already suggested this? You could back their idea instead.</p>
              <ul className="plain">
                {similar.map((i) => (
                  <li key={i.id}>
                    <Link to={`/ideas/${i.id}`} target="_blank" rel="noreferrer">
                      {i.title}
                    </Link>
                    <div>
                      <IdeaStage idea={i} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          </aside>
        )}
      </div>
    </>
  );
}
