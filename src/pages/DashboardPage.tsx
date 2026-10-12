import { OFFICES, STAGES, STAGE_LABEL, canSeeDashboard } from '../domain/rules';
import type { Idea, Stage } from '../domain/types';
import { useApp } from '../store';
import { Bars, NoAccess, PageHeader, categoryOf, daysSince, fmtDate, plural } from '../ui';

const OPEN_STAGES: Stage[] = ['submitted', 'under_review', 'piloting'];
/** Longer than two monthly panel meetings in one stage. */
const SLOW_AFTER_DAYS = 60;

const count = <T,>(items: T[], test: (item: T) => boolean) => items.filter(test).length;

export default function DashboardPage() {
  const { state, me } = useApp();
  if (!canSeeDashboard(me))
    return <NoAccess title="Dashboard">The pipeline dashboard is for the admin and the innovation panel.</NoAccess>;

  // Confidential ideas are counted everywhere on this page but never named,
  // so the page is safe to share with leadership as it stands.
  const ideas = state.ideas;
  const confidential = count(ideas, (i) => i.confidential);
  const decided = count(ideas, (i) => i.stage === 'implemented' || i.stage === 'declined');
  const implemented = count(ideas, (i) => i.stage === 'implemented');
  const label = (i: Idea) => (i.confidential ? 'Confidential idea' : i.title);

  const slow = ideas
    .filter((i) => OPEN_STAGES.includes(i.stage) && daysSince(i.stageEnteredAt) > SLOW_AFTER_DAYS)
    .sort((a, b) => a.stageEnteredAt.localeCompare(b.stageEnteredAt));

  const recent = ideas
    .flatMap((i) => i.decisions.filter((d) => d.from !== d.to).map((d) => ({ idea: i, decision: d })))
    .sort((a, b) => b.decision.at.localeCompare(a.decision.at))
    .slice(0, 5);

  const months = Array.from({ length: 6 }, (_, n) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - n));
    return d;
  });

  return (
    <>
      <PageHeader
        title="Pipeline dashboard"
        intro={`As of ${fmtDate(new Date())}. Confidential ideas are included in every total but never named, so this page can be shared with leadership.`}
      >
        <button type="button" className="button" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </PageHeader>

      <div className="tiles">
        <div className="card tile">
          <span className="tile-value">{ideas.length}</span>
          <span className="tile-label">Ideas in the pipeline</span>
          <span className="hint">Including {confidential} confidential</span>
        </div>
        <div className="card tile">
          <span className="tile-value">{count(ideas, (i) => i.stage === 'submitted')}</span>
          <span className="tile-label">Waiting for first review</span>
        </div>
        <div className="card tile">
          <span className="tile-value">{count(ideas, (i) => i.stage === 'piloting')}</span>
          <span className="tile-label">Being piloted</span>
        </div>
        <div className="card tile">
          <span className="tile-value">{decided}</span>
          <span className="tile-label">With a final outcome</span>
          <span className="hint">
            {implemented} implemented, {decided - implemented} declined
          </span>
        </div>
      </div>

      <div className="grid-3">
        <section className="card">
          <h2>Ideas by stage</h2>
          <Bars rows={STAGES.map((s) => ({ label: STAGE_LABEL[s], value: count(ideas, (i) => i.stage === s) }))} />
        </section>
        <section className="card">
          <h2>Ideas by category</h2>
          <Bars tone="copper" rows={state.categories.map((k) => ({ label: k.name, value: count(ideas, (i) => i.categoryId === k.id), note: k.active ? undefined : '(retired)' }))} />
        </section>
        <section className="card">
          <h2>Ideas by office</h2>
          <Bars tone="grey" rows={OFFICES.map((o) => ({ label: o, value: count(ideas, (i) => i.office === o) }))} />
        </section>
      </div>

      <details className="card">
        <summary>Stage by office</summary>
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Office</th>
                {STAGES.map((s) => (
                  <th scope="col" key={s} className="num">
                    {STAGE_LABEL[s]}
                  </th>
                ))}
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {OFFICES.map((o) => (
                <tr key={o}>
                  <th scope="row">{o}</th>
                  {STAGES.map((s) => (
                    <td key={s} className="num">
                      {count(ideas, (i) => i.office === o && i.stage === s)}
                    </td>
                  ))}
                  <td className="num">
                    <strong>{count(ideas, (i) => i.office === o)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="grid-2">
        <section className="card">
          <h2>
            Waiting more than {SLOW_AFTER_DAYS} days in one stage <span className="muted">{slow.length}</span>
          </h2>
          {slow.length === 0 ? (
            <p className="hint">No ideas have been waiting that long.</p>
          ) : (
            <ul className="plain rows">
              {slow.map((i) => (
                <li key={i.id}>
                  <span>
                    {label(i)} <span className="hint">{i.office}</span>
                  </span>
                  <span className="hint">
                    {STAGE_LABEL[i.stage]} for {plural(daysSince(i.stageEnteredAt), 'day')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Recent panel decisions</h2>
          <ul className="plain rows">
            {recent.map(({ idea, decision }) => (
              <li key={decision.id}>
                <span>
                  {label(idea)} <span className="hint">{idea.confidential ? '' : categoryOf(state, idea.categoryId)}</span>
                </span>
                <span>
                  {STAGE_LABEL[decision.to]}, {fmtDate(decision.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <details className="card">
        <summary>Time in each stage and monthly submissions</summary>
        <h3>Average days in the current stage</h3>
        <Bars
          rows={OPEN_STAGES.map((s) => {
            const inStage = ideas.filter((i) => i.stage === s);
            const avg = inStage.length ? Math.round(inStage.reduce((sum, i) => sum + daysSince(i.stageEnteredAt), 0) / inStage.length) : 0;
            return { label: STAGE_LABEL[s], value: avg, note: 'days' };
          })}
        />
        <h3>Ideas submitted each month</h3>
        <Bars
          rows={months.map((m) => ({
            label: m.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
            value: count(ideas, (i) => {
              const d = new Date(i.createdAt);
              return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
            }),
          }))}
        />
      </details>
    </>
  );
}
