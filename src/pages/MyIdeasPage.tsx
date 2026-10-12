import { Link } from 'react-router-dom';
import { MAX_RESUBMISSIONS } from '../domain/rules';
import type { Idea } from '../domain/types';
import { useApp } from '../store';
import { ConfidentialTag, Empty, IdeaStage, PageHeader, daysSince, plural } from '../ui';

function nextStep(idea: Idea): string {
  switch (idea.stage) {
    case 'submitted':
      return 'Waiting for the next panel meeting. You can still edit or withdraw it.';
    case 'under_review':
      return 'The panel is reviewing this idea.';
    case 'piloting':
      return idea.pilotResult ? 'The panel will decide the outcome at its next meeting.' : 'The pilot is under way.';
    case 'implemented':
      return 'This idea has been implemented.';
    case 'declined':
      return idea.resubmissions < MAX_RESUBMISSIONS ? 'You can improve and resubmit this idea once.' : 'This idea has been declined after resubmission.';
  }
}

export default function MyIdeasPage() {
  const { state, me } = useApp();
  const mine = state.ideas.filter((i) => i.submitterId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pilots = state.ideas.filter((i) => i.pilotOwnerId === me.id && i.stage === 'piloting');

  return (
    <div className="page-narrow">
      <PageHeader title="My ideas" />

      {pilots.length > 0 && (
        <section className="card">
          <h2>Pilots you are leading</h2>
          <ul className="plain rows">
            {pilots.map((i) => (
              <li key={i.id}>
                <div>
                  <Link to={`/ideas/${i.id}`} className="row-title">{i.title}</Link> {i.confidential && <ConfidentialTag />}
                  <p className="hint">
                    {i.pilotResult
                      ? 'You have submitted the final results. The panel will decide the outcome.'
                      : `Piloting for ${plural(daysSince(i.stageEnteredAt), 'day')}. Submit your final results when the trial has finished.`}
                  </p>
                </div>
                {!i.pilotResult && (
                  <Link className="button small primary" to={`/ideas/${i.id}`}>
                    Submit results
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        {pilots.length > 0 && <h2>Ideas you have submitted</h2>}
        {mine.length === 0 ? (
          <Empty>You have not submitted an idea yet. Every idea is welcome, large or small.</Empty>
        ) : (
          <ul className="plain rows">
            {mine.map((i) => {
              return (
                <li key={i.id}>
                  <div>
                    <Link to={`/ideas/${i.id}`} className="row-title">{i.title}</Link> <IdeaStage idea={i} /> {i.confidential && <ConfidentialTag />}
                    <p className="hint">
                      {nextStep(i)} {plural(i.votes.length, 'vote')}.
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
