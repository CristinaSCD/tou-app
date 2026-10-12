import { Link } from 'react-router-dom';
import { canSeePanel, nextPanelMeeting, readyForPanel, scoreBlocker } from '../domain/rules';
import type { Idea } from '../domain/types';
import { useApp } from '../store';
import { ConfidentialTag, Empty, NoAccess, PageHeader, fmtDate, nameOf, plural } from '../ui';

function Section({ title, ideas }: { title: string; ideas: Idea[] }) {
  const { state, me } = useApp();
  const reviewers = state.colleagues.filter((c) => c.isReviewer);
  if (ideas.length === 0) return null;

  return (
    <section className="card">
      <h2>
        {title} <span className="muted">{ideas.length}</span>
      </h2>
      <ul className="plain rows">
        {ideas.map((i) => {
          const eligible = reviewers.filter((r) => r.id !== i.submitterId).length;
          const own = i.submitterId === me.id;
          const scored = i.scores.some((s) => s.reviewerId === me.id);
          const canScore = !scoreBlocker(me, i);
          return (
            <li key={i.id}>
              <div>
                <Link to={`/ideas/${i.id}`} className="row-title">
                  {i.title}
                </Link>{' '}
                {i.confidential && <ConfidentialTag />} {i.resubmissions > 0 && <span className="badge">Resubmitted</span>}
                <p className="hint">
                  {nameOf(state, i.submitterId)}, {i.office}. {plural(i.votes.length, 'vote')}. {i.scores.length} of {eligible} scored.
                </p>
              </div>
              {own ? (
                <span className="badge">Your idea</span>
              ) : scored ? (
                <span className="badge done">Scored</span>
              ) : canScore ? (
                <Link to={`/ideas/${i.id}`} className="button small primary">
                  Score
                </Link>
              ) : (
                <Link to={`/ideas/${i.id}`} className="button small">
                  Review
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function PanelPage() {
  const { state, me } = useApp();
  if (!canSeePanel(me))
    return <NoAccess title="Panel">This page is for innovation panel reviewers.</NoAccess>;

  const ready = readyForPanel(state);
  const total = ready.pilotResults.length + ready.newIdeas.length + ready.carriedOver.length;
  const toScore = [...ready.newIdeas, ...ready.carriedOver].filter(
    (i) => !scoreBlocker(me, i) && !i.scores.some((s) => s.reviewerId === me.id),
  ).length;

  return (
    <div className="page-narrow">
      <PageHeader
        title="Ready for panel"
        intro={`Next meeting ${fmtDate(nextPanelMeeting(new Date()))}. ${plural(total, 'idea')} to discuss, ${toScore} waiting for your score.`}
      />
      {total === 0 ? (
        <Empty>Nothing is waiting for the panel.</Empty>
      ) : (
        <div className="stack">
          <Section title="Pilot results to decide" ideas={ready.pilotResults} />
          <Section title="New ideas" ideas={ready.newIdeas} />
          <Section title="Carried over" ideas={ready.carriedOver} />
        </div>
      )}
    </div>
  );
}
