import { useMemo, useState } from 'react';
import { OFFICES, STAGES, STAGE_LABEL, visibleIdeas } from '../domain/rules';
import { useApp } from '../store';
import { Empty, IdeaCard, nameOf, plural } from '../ui';

export default function IdeasPage() {
  const { state, me } = useApp();
  const [query, setQuery] = useState('');
  const [office, setOffice] = useState('');
  const [category, setCategory] = useState('');
  const [stage, setStage] = useState('');
  const [sort, setSort] = useState<'votes' | 'newest'>('votes');

  const ideas = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return visibleIdeas(state, me)
      .filter((i) => !office || i.office === office)
      .filter((i) => !category || i.categoryId === category)
      .filter((i) => !stage || i.stage === stage)
      .filter((i) => {
        if (words.length === 0) return true;
        const text = `${i.title} ${i.problem} ${i.solution} ${i.expectedImpact} ${nameOf(state, i.submitterId)}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) =>
        sort === 'votes'
          ? b.votes.length - a.votes.length || b.createdAt.localeCompare(a.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
      );
  }, [state, me, query, office, category, stage, sort]);

  const filtered = Boolean(query || office || category || stage);

  return (
    <div className="page-narrow">
      <h1>Ideas</h1>

      <form className="finder" role="search" onSubmit={(e) => e.preventDefault()}>
        <input
          className="search"
          type="search"
          aria-label="Search ideas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ideas"
        />
        <div className="chips">
          <select aria-label="Office" value={office} onChange={(e) => setOffice(e.target.value)} className={office ? 'active' : ''}>
            <option value="">All offices</option>
            {OFFICES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={category ? 'active' : ''}>
            <option value="">All categories</option>
            {state.categories.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
          <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className={stage ? 'active' : ''}>
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
          <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as 'votes' | 'newest')} className="sort">
            <option value="votes">Most backed first</option>
            <option value="newest">Newest first</option>
          </select>
        </div>
      </form>

      <p className="result-count" aria-live="polite">
        {plural(ideas.length, 'idea')}
        {filtered && (
          <>
            {' found. '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setQuery('');
                setOffice('');
                setCategory('');
                setStage('');
              }}
            >
              Clear filters
            </button>
          </>
        )}
      </p>

      {ideas.length === 0 ? (
        <Empty>No ideas match. Try a different search, or be the first to submit one.</Empty>
      ) : (
        <div className="idea-list">
          {ideas.map((i) => (
            <IdeaCard key={i.id} idea={i} />
          ))}
        </div>
      )}
    </div>
  );
}
