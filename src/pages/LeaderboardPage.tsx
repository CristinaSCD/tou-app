import { Link } from 'react-router-dom';
import { leaderboard, quarterStart } from '../domain/rules';
import { useApp } from '../store';
import { Empty, PageHeader, IdeaStage, categoryOf, fmtDate, nameOf, plural } from '../ui';

export default function LeaderboardPage() {
  const { state } = useApp();
  const now = new Date();
  const rows = leaderboard(state, now);
  const quarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;

  return (
    <>
      <PageHeader
        title="Most-backed ideas this quarter"
        intro={`The ideas colleagues have backed most since ${fmtDate(quarterStart(now))} (${quarter}).`}
      />
      <section className="card">
        {rows.length === 0 ? (
          <Empty>No votes have been cast yet this quarter. Browse the ideas and back the ones you support.</Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th scope="col" className="num">
                  Position
                </th>
                <th scope="col">Idea</th>
                <th scope="col">Category</th>
                <th scope="col">Office</th>
                <th scope="col">Stage</th>
                <th scope="col" className="num">
                  Votes this quarter
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ idea, votes }, n) => (
                <tr key={idea.id}>
                  <td className="num">{n + 1}</td>
                  <th scope="row">
                    <Link to={`/ideas/${idea.id}`}>{idea.title}</Link>
                    <div className="hint">{nameOf(state, idea.submitterId)}</div>
                  </th>
                  <td>{categoryOf(state, idea.categoryId)}</td>
                  <td>{idea.office}</td>
                  <td>
                    <IdeaStage idea={idea} />
                  </td>
                  <td className="num">
                    <strong>{votes}</strong> <span className="hint">of {plural(idea.votes.length, 'vote')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
