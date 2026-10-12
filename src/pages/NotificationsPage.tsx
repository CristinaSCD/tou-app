import { Link } from 'react-router-dom';
import * as actions from '../domain/actions';
import { canViewIdea } from '../domain/rules';
import { useApp } from '../store';
import { Empty, PageHeader, fmtDate } from '../ui';

export default function NotificationsPage() {
  const { state, me, run } = useApp();
  const mine = state.notifications.filter((n) => n.toId === me.id).sort((a, b) => b.at.localeCompare(a.at));
  const unread = mine.filter((n) => !n.read).length;

  return (
    <div className="page-narrow">
      <PageHeader title="Notifications">
        {unread > 0 && (
          <button type="button" className="button small" onClick={() => run((s) => actions.markNotificationsRead(s, me.id))}>
            Mark all as read
          </button>
        )}
      </PageHeader>
      {mine.length === 0 ? (
        <Empty>You have no notifications yet.</Empty>
      ) : (
        <ul className="plain card notifications">
          {mine.map((n) => {
            const idea = state.ideas.find((i) => i.id === n.ideaId);
            const body = (
              <>
                <span className="notification-text">
                  {!n.read && <span className="visually-hidden">New: </span>}
                  {n.text}
                </span>
                <span className="hint">{fmtDate(n.at)}</span>
              </>
            );
            return (
              <li key={n.id} className={n.read ? '' : 'unread'}>
                {idea && canViewIdea(me, idea) ? <Link to={`/ideas/${idea.id}`}>{body}</Link> : <div>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
