import { useState, type FormEvent } from 'react';
import * as actions from '../domain/actions';
import { canAdminister } from '../domain/rules';
import { useApp } from '../store';
import { FieldError, NoAccess, PageHeader, plural } from '../ui';

export default function AdminPage() {
  const { state, me, run } = useApp();
  const [newCategory, setNewCategory] = useState('');
  const [addReviewerId, setAddReviewerId] = useState('');
  const [categoryTried, setCategoryTried] = useState(false);
  const [reviewerTried, setReviewerTried] = useState(false);

  if (!canAdminister(me)) return <NoAccess title="Admin">Only the admin can manage categories and reviewers.</NoAccess>;

  const reviewers = state.colleagues.filter((c) => c.isReviewer);
  const others = state.colleagues.filter((c) => !c.isReviewer);

  function addCategory(e: FormEvent) {
    e.preventDefault();
    setCategoryTried(true);
    if (!newCategory.trim()) return;
    if (run((s) => actions.addCategory(s, me.id, newCategory), 'The category has been added.')) {
      setNewCategory('');
      setCategoryTried(false);
    }
  }

  function addReviewer(e: FormEvent) {
    e.preventDefault();
    setReviewerTried(true);
    if (!addReviewerId) return;
    if (run((s) => actions.setReviewer(s, me.id, addReviewerId, true), 'The colleague has been added to the innovation panel.')) {
      setAddReviewerId('');
      setReviewerTried(false);
    }
  }

  return (
    <>
      <PageHeader title="Admin" intro="Manage the categories colleagues choose from and who sits on the innovation panel." />
      <div className="grid-2">
        <section className="card">
          <h2>Categories</h2>
          <p className="hint">Retiring a category keeps it on existing ideas but removes it from the list for new ideas.</p>
          <ul className="plain rows">
            {state.categories.map((k) => {
              const used = state.ideas.filter((i) => i.categoryId === k.id).length;
              return (
                <li key={k.id}>
                  <span>
                    {k.name} {!k.active && <span className="badge">Retired</span>}
                    <span className="hint"> {plural(used, 'idea')}</span>
                  </span>
                  <span className="row-actions">
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
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        run(
                          (s) => actions.setCategoryActive(s, me.id, k.id, !k.active),
                          k.active ? 'The category has been retired.' : 'The category is available again.',
                        )
                      }
                    >
                      {k.active ? 'Retire' : 'Restore'}
                    </button>
                  </span>
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
            Reviewers can see confidential ideas, score ideas they did not submit, and record the panel's decisions.
          </p>
          <ul className="plain rows">
            {reviewers.map((c) => (
              <li key={c.id}>
                <span>
                  {c.name} {c.isAdmin && <span className="badge">Chair</span>}
                  <span className="hint">
                    {' '}
                    {c.jobTitle}, {c.office}
                  </span>
                </span>
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    window.confirm(`Remove ${c.name} from the innovation panel? Scores they have already given will be kept.`) &&
                    run((s) => actions.setReviewer(s, me.id, c.id, false), `${c.name} has been removed from the innovation panel.`)
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form className="inline-form" onSubmit={addReviewer}>
            <div className={`field grow ${reviewerTried && !addReviewerId ? 'invalid' : ''}`}>
              <label htmlFor="add-reviewer">Add a reviewer</label>
              <select id="add-reviewer" value={addReviewerId} onChange={(e) => setAddReviewerId(e.target.value)}>
                <option value="">Choose a colleague</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.jobTitle}, {c.office})
                  </option>
                ))}
              </select>
              <FieldError show={reviewerTried && !addReviewerId}>please choose a colleague.</FieldError>
            </div>
            <button type="submit" className="button primary">
              Add reviewer
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
