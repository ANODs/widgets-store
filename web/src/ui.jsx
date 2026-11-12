import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { frameUrl, iconUrl, shotUrl, tg } from './api.js';
import { t } from './i18n.js';

export const Nav = createContext(() => {});
export const useNav = () => useContext(Nav);
export const Toast = createContext(() => {});
export const useToast = () => useContext(Toast);

export function useScheme() {
  const read = () => tg?.colorScheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [scheme, setScheme] = useState(read);
  useEffect(() => {
    const on = () => setScheme(read());
    tg?.onEvent('themeChanged', on);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', on);
    return () => { tg?.offEvent('themeChanged', on); mq.removeEventListener('change', on); };
  }, []);
  return scheme;
}

export function useLoad(fn, deps) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => alive && setState({ data, loading: false }), (error) => alive && setState({ error, loading: false }));
    return () => { alive = false; };
  }, deps);
  return state;
}

const GRADIENTS = [['#ff9a5a', '#ff5e62'], ['#5b8def', '#7b5cf0'], ['#34c98e', '#1fa2a8'], ['#f7b733', '#fc6a3a'], ['#e85d9e', '#a445e0'], ['#3fb6f0', '#2f6bea']];

export function Icon({ w, size = 64 }) {
  const url = iconUrl(w);
  const style = { width: size, height: size, borderRadius: size * 0.225, fontSize: size * 0.44 };
  if (url) return <img className="icon" style={style} src={url} alt="" loading="lazy" />;
  let h = 0;
  for (const c of w.id || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = GRADIENTS[h % GRADIENTS.length];
  return <div className="icon icon-letter" style={{ ...style, background: `linear-gradient(135deg, ${a}, ${b})` }}>{(w.name || '?').trim().slice(0, 1).toUpperCase()}</div>;
}

export function Row({ w, rank, badge }) {
  const nav = useNav();
  return (
    <div className="row" onClick={() => nav(w.status && w.status !== 'published' && badge ? `submit/${w.id}` : `w/${w.id}`)}>
      {rank ? <div className="rank">{rank}</div> : null}
      <Icon w={w} />
      <div className="row-text">
        <div className="row-title">{w.name || t('status_draft')}</div>
        <div className="row-sub">{w.short || (w.bot ? `@${w.bot}` : '')}</div>
        {badge ? <div className={`badge badge-${w.status}`}>{t(`status_${w.status}`)}</div> : null}
      </div>
      <button className="pill">{t('open')}</button>
    </div>
  );
}

export function List({ items, ranked, badge }) {
  return <div className="list">{items.map((w, i) => <Row key={w.id} w={w} rank={ranked ? i + 1 : 0} badge={badge} />)}</div>;
}

export function Skeleton({ rows = 4 }) {
  return (
    <div className="list">
      {Array.from({ length: rows }, (_, i) => (
        <div className="row" key={i}>
          <div className="sk" style={{ width: 64, height: 64, borderRadius: 14 }} />
          <div className="row-text"><div className="sk" style={{ width: 90, height: 16 }} /><div className="sk" style={{ width: 150, height: 14, marginTop: 8 }} /></div>
          <div className="sk" style={{ width: 62, height: 30, borderRadius: 30 }} />
        </div>
      ))}
    </div>
  );
}

export function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

// A static picture when the worker has rendered one, otherwise the live stand-in frame
export function Shot({ w, scheme, className }) {
  const url = shotUrl(w, scheme);
  if (url) return <img className={className} src={url} alt="" loading="lazy" />;
  return <iframe className={className} title={w.name} src={frameUrl(w.id, scheme)} sandbox="allow-scripts" loading="lazy" tabIndex={-1} style={{ pointerEvents: 'none' }} />;
}

export function LiveFrame({ id, scheme, version = 0, fixedHeight = 0 }) {
  const ref = useRef(null);
  const toast = useToast();
  const [height, setHeight] = useState(fixedHeight || 220);
  useEffect(() => {
    const on = (e) => {
      if (!ref.current || e.source !== ref.current.contentWindow || !e.data || typeof e.data !== 'object') return;
      const m = e.data;
      if (m.widget === 'height' && !fixedHeight) setHeight(Math.min(600, Math.max(50, Number(m.height) || 0)));
      // The preview is a sandbox: nothing a widget asks for leaves this page
      if (m.widget === 'link' || m.widget === 'request' || m.widget === 'copy') toast(t('sandboxNote'));
    };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, [id, fixedHeight]);
  return (
    <div className={`bubble bubble-${scheme}`}>
      <iframe ref={ref} title="widget" src={frameUrl(id, scheme, version)} sandbox="allow-scripts" style={{ height }} />
    </div>
  );
}
