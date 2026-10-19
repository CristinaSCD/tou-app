import { useState, type FormEvent } from 'react';
import * as actions from '../domain/actions';
import { PANEL_SIZE, canAdminister } from '../domain/rules';
import type { Colleague } from '../domain/types';
import { useApp } from '../store';
import { FieldError, NoAccess, PageHeader, plural } from '../ui';

export default function AdminPage() {
  const { state, me, run } = useApp();
  const [newCategory, setNewCategory] = useState('');
  const [categoryTried, setCategoryTried] = useState(false);
  const [replacingId, setReplacingId] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [replaceTried, setReplaceTried] = useState(false);

  if (!canAdminister(me)) return <NoAccess title="Admin">Only the admin can manage categories and reviewers.</NoAccess>;

  const reviewers = state.colleagues.filter((c) => c.isReviewer);

  function addCategory(e: FormEvent) {
    e.preventDefault();
    setCategoryTried(true);
    if (!newCategory.trim()) return;
    if (run((s) => actions.addCategory(s, me.id, newCategory), 'The category has been added.')) {
      setNewCategory('');
      setCategoryTried(false);
    }
  }

  function startReplacing(id: string) {
    setReplacingId(id);
    setReplacementId('');
    setReplaceTried(false);
  }

  function replace(e: FormEvent, outgoing: Colleague) {
    e.preventDefault();
    setReplaceTried(true);
    if (!replacementId) return;
    const incoming = state.colleagues.find((c) => c.id === replacementId)!;
    const done = `${incoming.name} has replaced ${outgoing.name} on the innovation panel. Scores ${outgoing.name} has already given are kept.`;
    if (run((s) => actions.replaceReviewer(s, me.id, outgoing.id, replacementId), done)) startReplacing('');
  }

  return (
    <>
      <PageHeader title="Admin" intro="Manage the categories colleagues choose from and who sits on the innovation panel." />
      <div className="grid-2">
        <section className="card">
          <h2>Categories</h2>
          <p className="hint">Renaming a category updates it on every idea. Categories cannot be removed.</p>
          <ul className="plain rows">
            {state.categories.map((k) => {
              const used = state.ideas.filter((i) => i.categoryId === k.id).length;
              return (
                <li key={k.id}>
                  <span>
                    {k.name}
                    <span className="hint"> {plural(used, 'idea')}</span>
                  </span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      const name = window.prompt('New name for this category', k.name);
                      if (name !== null) run((s) => actions.renameCategory(s, me.id, k.id, name), 'The category has been renamed.');
                    }}
                  >
                    Rename
                  </button>
                </li>
              );
            })}
          </ul>
          <form className="inline-form" onSubmit={addCategory}>
            <div className={`field grow ${categoryTried && !newCategory.trim() ? 'invalid' : ''}`}>
              <label htmlFor="new-category">Add a category</label>
              <input id="new-category" type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
              <FieldError show={categoryTried && !newCategory.trim()}>please give the category a name.</FieldError>
            </div>
            <button type="submit" className="button primary">
              Add category
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Innovation panel ({reviewers.length})</h2>
          <p className="hint">
            The panel always has {PANEL_SIZE} members: the chair, two based in Bristol, two in Leeds and one in Glasgow. To
            change it, replace a reviewer with a colleague from the same office. Reviewers can see confidential ideas, score
            ideas they did not submit, and record the panel's decisions.
          </p>
          <ul className="plain rows">
            {reviewers.map((c) => {
              // Only colleagues from the same office keep the panel's office mix (PRD M10.12).
              const candidates = state.colleagues.filter((o) => !o.isReviewer && o.office === c.office);
              return (
                <li key={c.id} className={replacingId === c.id ? 'replacing' : undefined}>
                  <span>
                    {c.name} {c.isAdmin && <span className="badge">Chair</span>}
                    <span className="hint">
                      {' '}
                      {c.jobTitle}, {c.office}
                    </span>
                  </span>
                  {!c.isAdmin && replacingId !== c.id && (
                    <button type="button" className="link" onClick={() => startReplacing(c.id)}>
                      Replace
                    </button>
                  )}
                  {replacingId === c.id && (
                    <form className="inline-form" onSubmit={(e) => replace(e, c)}>
                      <div className={`field grow ${replaceTried && !replacementId ? 'invalid' : ''}`}>
                        <label htmlFor="replacement">Replace {c.name} with</label>
                        <select id="replacement" value={replacementId} onChange={(e) => setReplacementId(e.target.value)}>
                          <option value="">Choose a colleague based in {c.office}</option>
                          {candidates.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} ({o.jobTitle})
                            </option>
                          ))}
                        </select>
                        <FieldError show={replaceTried && !replacementId}>please choose a colleague.</FieldError>
                      </div>
                      <button type="submit" className="button primary">
                        Replace
                      </button>
                      <button type="button" className="button" onClick={() => startReplacing('')}>
                        Cancel
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
