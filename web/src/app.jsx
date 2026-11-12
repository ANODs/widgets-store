import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic, tg } from './api.js';
import { t } from './i18n.js';
import { Nav, Toast } from './ui.jsx';
import { Categories, Home, Listing, Mine, Search, Submit, WidgetPage } from './pages.jsx';

const TABS = ['', 'cats', 'top', 'mine'];

// Routes live in history state, not in the URL: Telegram keeps its launch data in the URL fragment.
function initialRoute() {
  const go = new URLSearchParams(location.search).get('go');
  if (go && /^[a-z0-9/_-]{1,40}$/i.test(go)) return go;
  const start = /^w_([a-z0-9]{10})$/.exec(tg?.initDataUnsafe?.start_param || '');
  return start ? `w/${start[1]}` : '';
}

const ICONS = {
  '': <path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1.5 3.5v4h7v-4h-7Z" fillRule="evenodd" />,
  cats: <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />,
  top: <path d="M12 2.5l2.9 5.9 6.6 1-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.4l6.6-1L12 2.5Z" />,
  mine: <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z" />,
};
const LABELS = { '': 'today', cats: 'cats', top: 'top', mine: 'mine' };

function Tabbar({ route, nav }) {
  return (
    <nav className="tabbar">
      <div className="tabs">
        {TABS.map((tab) => (
          <button key={tab} className={`tab ${route === tab ? 'on' : ''}`} onClick={() => { haptic(); nav(tab, true); }}>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">{ICONS[tab]}</svg>
            <span>{t(LABELS[tab])}</span>
          </button>
        ))}
      </div>
      <button className={`tab-search ${route === 'search' ? 'on' : ''}`} onClick={() => { haptic(); nav('search', true); }} aria-label={t('search')}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
      </button>
    </nav>
  );
}

function Screen({ route }) {
  const [head, arg] = route.split('/');
  if (head === '') return <Home />;
  if (head === 'cats') return <Categories />;
  if (head === 'cat') return <Listing title={t(`cat_${arg}`)} query={`category=${arg}`} />;
  if (head === 'top') return <Listing title={t('popular')} query="sort=top" ranked />;
  if (head === 'list') return <Listing title={t('fresh')} query="sort=new" />;
  if (head === 'mine') return <Mine />;
  if (head === 'search') return <Search />;
  if (head === 'w' && arg) return <WidgetPage id={arg} />;
  if (head === 'submit') return <Submit id={arg} />;
  return <Home />;
}

export default function App() {
  const [route, setRoute] = useState(() => history.state?.route ?? initialRoute());
  const [toast, setToast] = useState('');
  const timer = useRef(0);
  const isRoot = TABS.includes(route) || route === 'search';

  const nav = useCallback((next, replace) => {
    const depth = history.state?.depth || 0;
    if (replace) history.replaceState({ route: next, depth }, '');
    else history.pushState({ route: next, depth: depth + 1 }, '');
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback(() => {
    if (history.state?.depth > 0) history.back();
    else nav('', true);
  }, [nav]);
  const showToast = useCallback((text) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  useEffect(() => {
    if (!history.state) history.replaceState({ route, depth: 0 }, '');
    const on = () => { setRoute(history.state?.route ?? ''); window.scrollTo(0, 0); };
    addEventListener('popstate', on);
    if (tg) {
      tg.ready();
      tg.expand();
      try { tg.setHeaderColor('secondary_bg_color'); } catch {}
    }
    return () => removeEventListener('popstate', on);
  }, []);

  useEffect(() => {
    if (!tg?.BackButton) return;
    if (isRoot) tg.BackButton.hide();
    else tg.BackButton.show();
    tg.BackButton.onClick(back);
    return () => tg.BackButton.offClick(back);
  }, [isRoot, back]);

  return (
    <Nav.Provider value={nav}>
      <Toast.Provider value={showToast}>
        {!isRoot && !tg ? <button className="back" onClick={back} aria-label="Back">‹</button> : null}
        <main key={route}><Screen route={route} /></main>
        {isRoot ? <Tabbar route={route} nav={nav} /> : null}
        {toast ? <div className="toast">{toast}</div> : null}
      </Toast.Provider>
    </Nav.Provider>
  );
}
