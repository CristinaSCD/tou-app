import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import logo from './assets/logo.svg';
import { canAdminister, canSeeDashboard, canSeePanel } from './domain/rules';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import IdeaFormPage from './pages/IdeaFormPage';
import IdeaPage from './pages/IdeaPage';
import IdeasPage from './pages/IdeasPage';
import LeaderboardPage from './pages/LeaderboardPage';
import MyIdeasPage from './pages/MyIdeasPage';
import NotificationsPage from './pages/NotificationsPage';
import PanelPage from './pages/PanelPage';
import { useApp } from './store';
import { NoAccess } from './ui';

export default function App() {
  const { state, me, setMeId, flash, clearFlash, resetDemoData } = useApp();
  const { pathname } = useLocation();
  const unread = state.notifications.filter((n) => n.toId === me.id && !n.read).length;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="brand-bar">
        <div className="wrap brand-inner">
          <Link to="/" className="brand" aria-label="Tallis and Reeve Idea Pipeline, home">
            <img src={logo} alt="Tallis & Reeve" />
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-name">Idea Pipeline</span>
          </Link>
          <div className="viewer">
            <label htmlFor="view-as">Viewing as</label>
            <select id="view-as" value={me.id} onChange={(e) => setMeId(e.target.value)}>
              {state.colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.office}
                  {c.isAdmin ? ', admin' : ''}
                  {c.isReviewer ? ', reviewer' : ''})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <nav className="nav-bar" aria-label="Main">
        <div className="wrap nav-inner">
          <NavLink to="/" end>
            Ideas
          </NavLink>
          <NavLink to="/mine">My ideas</NavLink>
          <NavLink to="/most-backed">Most backed</NavLink>
          {canSeePanel(me) && <NavLink to="/panel">Panel</NavLink>}
          {canSeeDashboard(me) && <NavLink to="/dashboard">Dashboard</NavLink>}
          {canAdminister(me) && <NavLink to="/admin">Admin</NavLink>}
          <span className="nav-spacer" />
          <NavLink to="/notifications">
            Notifications{unread > 0 && <span className="count">{unread}</span>}
          </NavLink>
          <Link to="/submit" className="nav-cta">
            Submit an idea
          </Link>
        </div>
      </nav>

      <main id="main" className="wrap">
        <Routes key={me.id}>
          <Route path="/" element={<IdeasPage />} />
          <Route path="/submit" element={<IdeaFormPage key="new" mode="new" />} />
          <Route path="/ideas/:id" element={<IdeaPage />} />
          <Route path="/ideas/:id/edit" element={<IdeaFormPage key="edit" mode="edit" />} />
          <Route path="/ideas/:id/resubmit" element={<IdeaFormPage key="resubmit" mode="resubmit" />} />
          <Route path="/mine" element={<MyIdeasPage />} />
          <Route path="/most-backed" element={<LeaderboardPage />} />
          <Route path="/panel" element={<PanelPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<NoAccess title="Page not found">We could not find that page.</NoAccess>} />
        </Routes>
      </main>

      <div className="toast-region" aria-live="polite">
        {flash && (
          <div className={`toast ${flash.kind}`} role={flash.kind === 'error' ? 'alert' : 'status'}>
            <span>
              {flash.kind === 'error' && <strong>Not done. </strong>}
              {flash.text}
            </span>
            <button type="button" className="link" onClick={clearFlash}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      <footer className="wrap footer">
        <span>Prototype with fictional data, saved in this browser only.</span>
        <button type="button" className="link" onClick={() => window.confirm('Reset all demo data to its starting point?') && resetDemoData()}>
          Reset demo data
        </button>
      </footer>
    </>
  );
}
