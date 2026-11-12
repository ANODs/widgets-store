import { useEffect, useRef, useState } from 'react';
import { api, BOT, canAuth, haptic, openLink, shareUrl, tg } from './api.js';
import { CATEGORY_EMOJI, errorText, lang, t } from './i18n.js';
import { Empty, Icon, List, LiveFrame, Shot, Skeleton, useLoad, useNav, useScheme, useToast } from './ui.jsx';

function Header({ title, sub }) {
  return (
    <header className="header">
      {sub ? <div className="header-sub">{sub}</div> : null}
      <h1>{title}</h1>
    </header>
  );
}

function Section({ title, more, children }) {
  const nav = useNav();
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {more ? <button className="link" onClick={() => nav(more)}>{t('all')}</button> : null}
      </div>
      {children}
    </section>
  );
}

function AddBanner() {
  const nav = useNav();
  return (
    <button className="add-banner" onClick={() => nav('submit')}>
      <span className="add-plus">+</span>
      <span className="row-text"><span className="row-title">{t('addYours')}</span><span className="row-sub">{t('addYoursSub')}</span></span>
    </button>
  );
}

function NeedTelegram() {
  return (
    <div className="empty">
      <p>{t('needTg')}</p>
      <button className="primary" onClick={() => openLink(`https://t.me/${BOT}`)}>{t('openTg')}</button>
    </div>
  );
}

function FeaturedCard({ w, scheme }) {
  const nav = useNav();
  return (
    <div className="card" onClick={() => nav(`w/${w.id}`)}>
      <div className={`card-shot bubble-${scheme}`}><Shot w={w} scheme={scheme} /></div>
      <div className="card-row">
        <Icon w={w} size={44} />
        <div className="row-text"><div className="row-title">{w.name}</div><div className="row-sub">{w.short}</div></div>
        <button className="pill">{t('open')}</button>
      </div>
    </div>
  );
}

export function Home() {
  const scheme = useScheme();
  const nav = useNav();
  const { data, loading, error } = useLoad(() => api('/home'), []);
  const date = new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <>
      <Header title={t('today')} sub={date} />
      {loading ? <><Section title=" "><Skeleton rows={3} /></Section><Section title=" "><Skeleton rows={3} /></Section></> : null}
      {error ? <Empty text={errorText(error)} /> : null}
      {data && !data.fresh.length ? <Empty text={t('emptyHome')} /> : null}
      {data && data.featured.length ? (
        <Section title={t('featured')}>
          <div className="carousel">{data.featured.map((w) => <FeaturedCard key={w.id} w={w} scheme={scheme} />)}</div>
        </Section>
      ) : null}
      {data && data.fresh.length ? <Section title={t('fresh')} more="list/new"><List items={data.fresh.slice(0, 5)} /></Section> : null}
      {data && data.top.length ? <Section title={t('popular')} more="top"><List items={data.top.slice(0, 5)} ranked /></Section> : null}
      {data ? (
        <Section title={t('cats')} more="cats">
          <div className="chips">
            {data.categories.filter((c) => c.count).map((c) => (
              <button key={c.id} className="chip" onClick={() => nav(`cat/${c.id}`)}>{CATEGORY_EMOJI[c.id]} {t(`cat_${c.id}`)}</button>
            ))}
          </div>
        </Section>
      ) : null}
      {data ? <div className="pad"><AddBanner /></div> : null}
    </>
  );
}

export function Categories() {
  const nav = useNav();
  const { data, loading } = useLoad(() => api('/home'), []);
  return (
    <>
      <Header title={t('cats')} />
      {loading ? <Skeleton /> : null}
      <div className="cat-grid">
        {(data?.categories || []).map((c) => (
          <button key={c.id} className="cat" onClick={() => nav(`cat/${c.id}`)}>
            <span className="cat-emoji">{CATEGORY_EMOJI[c.id]}</span>
            <span className="row-title">{t(`cat_${c.id}`)}</span>
            <span className="row-sub">{c.count}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function Listing({ title, query, ranked }) {
  const { data, loading, error } = useLoad(() => api(`/widgets?${query}`), [query]);
  return (
    <>
      <Header title={title} />
      {loading ? <Skeleton /> : null}
      {error ? <Empty text={errorText(error)} /> : null}
      {data && !data.items.length ? <Empty text={t('empty')} /> : null}
      {data ? <List items={data.items} ranked={ranked} /> : null}
    </>
  );
}

export function Search() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const { data, loading } = useLoad(() => api(`/widgets?sort=top&q=${encodeURIComponent(debounced)}`), [debounced]);
  return (
    <>
      <Header title={t('search')} />
      <div className="pad"><input className="field search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchHint')} /></div>
      {loading ? <Skeleton /> : null}
      {data && !data.items.length ? <Empty text={t('nothing')} /> : null}
      {data ? <List items={data.items} /> : null}
    </>
  );
}

export function Mine() {
  const nav = useNav();
  const { data, loading, error } = useLoad(() => (canAuth ? api('/me') : Promise.resolve(null)), []);
  return (
    <>
      <Header title={t('myTitle')} />
      {!canAuth ? <NeedTelegram /> : null}
      {loading ? <Skeleton rows={2} /> : null}
      {error ? <Empty text={errorText(error)} /> : null}
      {data ? <div className="pad"><AddBanner /></div> : null}
      {data && data.items.length ? <List items={data.items} badge /> : null}
      {data && !data.items.length ? <Empty text={t('empty')} /> : null}
    </>
  );
}

export function WidgetPage({ id }) {
  const toast = useToast();
  const nav = useNav();
  const appScheme = useScheme();
  const [scheme, setScheme] = useState(appScheme);
  const { data: w, loading, error } = useLoad(() => api(`/widgets/${id}`), [id]);
  useEffect(() => setScheme(appScheme), [appScheme]);

  if (loading) return <><Header title=" " /><Skeleton rows={1} /></>;
  if (error) return <><Header title=" " /><Empty text={errorText(error)} /></>;

  const open = () => {
    haptic();
    api(`/widgets/${id}/open`, { method: 'POST' }).catch(() => {});
    openLink(w.link);
  };
  const share = () => {
    const url = shareUrl(id);
    if (tg) return tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(w.name)}`);
    navigator.clipboard?.writeText(url).then(() => toast(t('copied')), () => {});
  };

  return (
    <div className="page">
      <div className="hero">
        <Icon w={w} size={104} />
        <div className="hero-text">
          <h1>{w.name}</h1>
          <div className="row-sub">{w.short}</div>
          <button className="link bot" onClick={open}>@{w.bot}</button>
          <div className="hero-actions">
            <button className="primary" onClick={open}>{t('openAuthor')}</button>
            <button className="round" onClick={share} aria-label={t('share')}>
              <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 3v12M12 3l-4 4M12 3l4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </div>
      {w.status !== 'published' ? <div className="pad"><span className={`badge badge-${w.status}`}>{t(`status_${w.status}`)}</span></div> : null}
      <div className="stats">
        <div><b>{w.opens}</b><span>{t('opens')}</span></div>
        <div onClick={() => nav(`cat/${w.category}`)}><b>{CATEGORY_EMOJI[w.category]}</b><span>{t(`cat_${w.category}`)}</span></div>
        <div><b>{w.size}</b><span>{t('bytes')}</span></div>
      </div>
      <section className="section">
        <div className="section-head">
          <h2>{t('preview')}</h2>
          <div className="seg">
            <button className={scheme === 'light' ? 'on' : ''} onClick={() => setScheme('light')}>{t('light')}</button>
            <button className={scheme === 'dark' ? 'on' : ''} onClick={() => setScheme('dark')}>{t('dark')}</button>
          </div>
        </div>
        <div className={`chat chat-${scheme}`}><LiveFrame id={id} scheme={scheme} fixedHeight={w.height} /></div>
        <p className="note">{t('previewNote')}</p>
      </section>
      {w.description ? <Section title={t('about')}><p className="text">{w.description}</p></Section> : null}
    </div>
  );
}

function readIcon(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256, canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function NewDraft() {
  const nav = useNav();
  const toast = useToast();
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async (source) => {
    setBusy(true);
    try {
      const { id } = await api('/drafts', { method: 'POST', body: { html: source } });
      nav(`submit/${id}`, true);
    } catch (e) {
      toast(errorText(e));
      setBusy(false);
    }
  };
  const pick = async (e) => {
    const file = e.target.files[0];
    if (file) create(await file.text());
  };
  return (
    <>
      <Header title={t('submitTitle')} />
      <div className="pad stack">
        <div className="panel">
          <div className="row-title">{t('stepForward')}</div>
          <p className="note flat">{t('stepForwardSub')}</p>
          <button className="primary" onClick={() => openLink(`https://t.me/${BOT}?start=submit`)}>{t('openBot')}</button>
        </div>
        <div className="panel">
          <div className="row-title">{t('orFile')}</div>
          <label className="secondary file">{t('chooseFile')}<input type="file" accept=".html,.htm,text/html" onChange={pick} hidden /></label>
          <textarea className="field" rows={5} value={html} onChange={(e) => setHtml(e.target.value)} placeholder={t('pasteHtml')} spellCheck={false} />
          <button className="primary" disabled={busy || !html.trim()} onClick={() => create(html)}>{t('next')}</button>
        </div>
      </div>
    </>
  );
}

function EditDraft({ id }) {
  const nav = useNav();
  const toast = useToast();
  const scheme = useScheme();
  const { data: w, loading, error } = useLoad(() => api(`/widgets/${id}`), [id]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => {
    if (w) setForm({ name: w.name, short: w.short, description: w.description || '', category: w.category || 'other', link: w.link || '', public_data: w.public_data || '', icon: null });
  }, [w]);
  if (loading || (!form && !error)) return <><Header title={t('submitTitle')} /><Skeleton rows={2} /></>;
  if (error) return <><Header title={t('submitTitle')} /><Empty text={errorText(error)} /></>;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const pickIcon = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { setForm({ ...form, icon: await readIcon(file) }); } catch { toast(t('err_bad_icon')); }
  };
  const send = async () => {
    setBusy(true);
    try {
      await api(`/widgets/${id}/submit`, { method: 'POST', body: { ...form, icon: form.icon || undefined } });
      tg?.HapticFeedback?.notificationOccurred('success');
      toast(t('sent'));
      nav('mine', true);
    } catch (e) {
      toast(errorText(e));
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirm(t('removeAsk'))) return;
    await api(`/widgets/${id}`, { method: 'DELETE' }).catch(() => {});
    nav('mine', true);
  };
  return (
    <>
      <Header title={w.name || t('submitTitle')} sub={t(`status_${w.status}`)} />
      <div className={`chat chat-${scheme}`}><LiveFrame id={id} scheme={scheme} fixedHeight={w.height} /></div>
      <div className="pad stack">
        <div className="icon-pick" onClick={() => fileRef.current.click()}>
          {form.icon ? <img className="icon" src={form.icon} alt="" style={{ width: 64, height: 64, borderRadius: 14 }} /> : <Icon w={{ ...w, name: form.name }} />}
          <span className="link">{t('setIcon')}</span>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickIcon} hidden />
        </div>
        <label className="label">{t('name')}<input className="field" maxLength={40} value={form.name} onChange={set('name')} /></label>
        <label className="label">{t('short')}<input className="field" maxLength={70} value={form.short} onChange={set('short')} /></label>
        <label className="label">{t('link')}<input className="field" value={form.link} onChange={set('link')} placeholder={t('linkHint')} autoCapitalize="off" autoCorrect="off" /></label>
        <div className="label">{t('categoryField')}
          <div className="chips wrap">
            {Object.keys(CATEGORY_EMOJI).map((c) => (
              <button key={c} className={`chip ${form.category === c ? 'on' : ''}`} onClick={() => setForm({ ...form, category: c })}>{CATEGORY_EMOJI[c]} {t(`cat_${c}`)}</button>
            ))}
          </div>
        </div>
        <label className="label">{t('description')}<textarea className="field" rows={4} maxLength={1500} value={form.description} onChange={set('description')} /></label>
        <label className="label">{t('sample')}<textarea className="field mono" rows={3} value={form.public_data} onChange={set('public_data')} spellCheck={false} /><span className="note flat">{t('sampleHint')}</span></label>
        <button className="primary" disabled={busy} onClick={send}>{t('send')}</button>
        <button className="danger" onClick={remove}>{t('remove')}</button>
      </div>
    </>
  );
}

export function Submit({ id }) {
  if (!canAuth) return <><Header title={t('submitTitle')} /><NeedTelegram /></>;
  return id ? <EditDraft id={id} /> : <NewDraft />;
}
