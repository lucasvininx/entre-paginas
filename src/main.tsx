import { Modal } from './components/Modal';
import { statuses } from './status';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen,
  Search,
  ArrowUpRight,
  ArrowRight,
  Heart,
  Library,
  Clock,
  SlidersHorizontal,
  X,
  Download,
  Check,
  Leaf,
  Plus,
  LogOut,
  ShieldCheck,
  LoaderCircle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Menu,
} from 'lucide-react';
import { api, safeUrl } from './api';
import type { Book, User, Provider, RequestRow } from './types';
import { Admin } from './pages/Admin';
import './styles.css';
import './tablet.css';
import { useVisualViewport } from './hooks/useVisualViewport';

function App() {
  const [webLeads, setWebLeads] = useState<{ title: string; url: string; description: string }[]>(
    [],
  );
  useVisualViewport();
  const [catalogPage, setCatalogPage] = useState(1),
    [moreCatalog, setMoreCatalog] = useState(true);
  const [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState('discover'),
    [books, setBooks] = useState<Book[]>([]),
    [shelf, setShelf] = useState<Book[]>([]),
    [requests, setRequests] = useState<RequestRow[]>([]),
    [notifications, setNotifications] = useState<any[]>([]),
    [query, setQuery] = useState(''),
    [searched, setSearched] = useState(''),
    [loading, setLoading] = useState(false),
    [reports, setReports] = useState<Provider[]>([]),
    [toast, setToast] = useState(''),
    [error, setError] = useState(''),
    [login, setLogin] = useState(false),
    [detail, setDetail] = useState<Book | null>(null),
    [correction, setCorrection] = useState(false),
    [filter, setFilter] = useState('all'),
    [lang, setLang] = useState(''),
    [category, setCategory] = useState(''),
    [pagination, setPagination] = useState(1),
    [mobile, setMobile] = useState(false);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 6500);
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  useEffect(() => {
    api('/me')
      .then((r) => setUser(r.user))
      .catch(fail);
    api<Book[]>('/books').then(setBooks).catch(fail);
  }, []);
  useEffect(() => {
    if (user) {
      api<Book[]>('/shelf').then(setShelf).catch(fail);
      api('/notifications').then(setNotifications).catch(fail);
    }
  }, [user]);
  useEffect(() => {
    if (user && page === 'requests') {
      const load = () =>
        Promise.all([
          api<RequestRow[]>('/requests').then(setRequests),
          api('/notifications').then(setNotifications),
        ]).catch(fail);
      load();
      const t = setInterval(load, 7000);
      return () => clearInterval(t);
    }
  }, [page, user]);
  function navigate(p: string) {
    if (p !== 'discover' && !user) {
      setLogin(true);
      return;
    }
    setPage(p);
    setMobile(false);
    setPagination(1);
    setError('');
  }
  async function logout() {
    try {
      await api('/logout', {});
      setUser(null);
      setShelf([]);
      setNotifications([]);
      setPage('discover');
      setMobile(false);
    } catch (e) {
      fail(e);
    }
  }
  async function search(e?: React.FormEvent, value = query) {
    e?.preventDefault();
    if (!user) {
      setLogin(true);
      return;
    }
    if (value.trim().length < 2) return;
    setLoading(true);
    setError('');
    setSearched(value);
    setPage('discover');
    setPagination(1);
    try {
      const r = await api('/search', { query: value });
      setBooks(r.books);
      setReports(r.providers);
      setWebLeads(r.leads || []);
      if (r.message) notify(r.message);
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  async function open(b: Book) {
    try {
      setDetail(await api<Book>('/books/' + b.id));
    } catch (e) {
      fail(e);
    }
  }
  async function request(b: Book) {
    if (!user) {
      setLogin(true);
      return;
    }
    try {
      await api('/requests', { query: searched || b.title, bookId: b.id });
      notify('Pedido registrado. Acompanhe em Minhas solicitações.');
    } catch (e) {
      fail(e);
    }
  }
  async function save(b: Book, state?: Book['state'], favorite?: boolean) {
    if (!user) {
      setLogin(true);
      return;
    }
    const current = shelf.find((s) => s.id === b.id);
    try {
      await api(
        '/shelf/' + b.id,
        {
          state: state || current?.state || 'want',
          favorite: favorite ?? current?.favorite ?? false,
        },
        'PUT',
      );
      setShelf(await api<Book[]>('/shelf'));
      notify('Sua estante foi atualizada.');
    } catch (e) {
      fail(e);
    }
  }
  const base =
    page === 'shelf' ? shelf : page === 'favorites' ? shelf.filter((b) => b.favorite) : books;
  const filtered = base.filter(
    (b) =>
      (filter !== 'pdf' || b.available) &&
      (!lang || b.language === lang) &&
      (!category || b.category === category),
  );
  return (
    <>
      <header className="header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('discover');
          }}
        >
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          <span>
            entre páginas<small>HISTÓRIAS QUE ENCONTRAM VOCÊ</small>
          </span>
        </a>
        <nav
          id="primary-navigation"
          aria-label="Navegação principal"
          className={mobile ? 'nav show' : 'nav'}
        >
          {[
            ['discover', 'Descobrir'],
            ['shelf', 'Minha estante'],
            ['requests', 'Solicitações'],
          ].map(([p, t]) => (
            <button key={p} className={page === p ? 'active' : ''} onClick={() => navigate(p)}>
              {t}
            </button>
          ))}
          {user?.role === 'admin' && (
            <button className={page === 'admin' ? 'active' : ''} onClick={() => navigate('admin')}>
              Administração
            </button>
          )}
          <button className="compact-nav-action" onClick={() => navigate('favorites')}>
            Favoritos
          </button>
          {user && (
            <button className="compact-nav-action" onClick={logout}>
              Sair
            </button>
          )}
        </nav>
        <div className="header-actions">
          <button
            className="icon-btn heart-nav"
            aria-label="Favoritos"
            onClick={() => navigate('favorites')}
          >
            <Heart size={19} />
          </button>
          {user ? (
            <>
              <button className="avatar" title={user.name} onClick={() => navigate('requests')}>
                {user.name.charAt(0)}
              </button>
              <button className="icon-btn" title="Sair" onClick={logout}>
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <button className="login-link" onClick={() => setLogin(true)}>
              Entrar <ArrowUpRight size={15} />
            </button>
          )}
          <button
            className="icon-btn menu"
            aria-label={mobile ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobile}
            aria-controls="primary-navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu />
          </button>
        </div>
      </header>
      <main>
        {error && (
          <div className="alert error" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="Fechar erro">
              <X size={16} />
            </button>
          </div>
        )}
        {user && notifications.some((n) => !n.read_at) && (
          <div className="alert">
            <Bell size={17} />
            {notifications.find((n) => !n.read_at)?.message}
            <button
              onClick={async () => {
                await api('/notifications/read', {});
                setNotifications([]);
              }}
            >
              Entendi
            </button>
          </div>
        )}
        {page === 'admin' ? (
          <Admin notify={notify} fail={fail} />
        ) : page === 'requests' ? (
          <section className="inner">
            <div className="eyebrow">
              <Clock size={15} /> CADA HISTÓRIA TEM SEU TEMPO
            </div>
            <h1>
              Minhas solicitações<span>.</span>
            </h1>
            <p className="muted">Acompanhe os livros que estamos procurando para você.</p>
            <div className="request-list">
              {requests.length ? (
                requests.map((r) => (
                  <article className="request-card" key={r.id}>
                    <span className="request-icon">
                      <BookOpen />
                    </span>
                    <div>
                      <h3>{r.title || r.query}</h3>
                      <p>
                        {r.author || 'Consulta aguardando identificação'} ·{' '}
                        {new Date(r.last_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <span className={'badge ' + (r.status === 'available' ? 'green' : '')}>
                      {statuses[r.status] || r.status}
                    </span>
                    {r.status === 'available' && r.book_id && (
                      <button
                        className="button small"
                        onClick={() =>
                          api<Book>('/books/' + r.book_id)
                            .then(setDetail)
                            .catch(fail)
                        }
                      >
                        Ver livro <ArrowRight size={15} />
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <Empty
                  icon={<Clock />}
                  title="Seu próximo capítulo pode começar aqui."
                  text="Pesquise um livro. Quando faltar um PDF, guardamos seu pedido para procurar novamente."
                />
              )}
            </div>
          </section>
        ) : (
          <>
            {page === 'discover' ? (
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span className="tiny-line" /> UM CANTINHO PARA QUEM AMA LER
                  </div>
                  <h1>
                    Entre um livro
                    <br />e outro, <em>encontre-se.</em>
                  </h1>
                  <p>
                    Grandes histórias merecem ser encontradas.
                    <br />
                    Descubra livros, guarde seus favoritos e comece
                    <br className="desktop" /> o seu próximo capítulo.
                  </p>
                  <form className="search-form" onSubmit={search}>
                    <Search size={21} />
                    <input
                      aria-label="Título, autor ou ISBN"
                      placeholder="Qual história você quer encontrar?"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      required
                      minLength={2}
                      maxLength={200}
                    />
                    <button disabled={loading}>
                      {loading ? (
                        <LoaderCircle className="spin" size={19} />
                      ) : (
                        <>
                          Buscar <ArrowRight size={17} />
                        </>
                      )}
                    </button>
                  </form>
                  <div className="search-hint">
                    Busque por título, autor ou ISBN <span>•</span> PDFs de fontes autorizadas
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orb" />
                  <div className="art-stars star-one">✧</div>
                  <div className="art-stars star-two">✦</div>
                  <div className="floating-label">
                    <Leaf size={16} /> Histórias para florescer
                  </div>
                  <div className="art-book art-back">
                    <span>
                      UM UNIVERSO
                      <br />
                      EM CADA
                      <br />
                      PÁGINA
                    </span>
                    <div className="book-arch" />
                  </div>
                  <div className="art-book art-front">
                    <small>ENTRE PÁGINAS</small>
                    <span>
                      o prazer
                      <br />
                      de se
                      <br />
                      <i>perder.</i>
                    </span>
                    <div className="book-flower">✳</div>
                    <small>E SE ENCONTRAR.</small>
                  </div>
                  <div className="art-book art-flat" />
                  <div className="art-caption">
                    um livro, infinitas possibilidades <span>↗</span>
                  </div>
                </div>
              </section>
            ) : (
              <section className="shelf-heading">
                <div className="eyebrow">
                  <Library size={16} /> SEU PEQUENO UNIVERSO
                </div>
                <h1>
                  {page === 'favorites' ? 'Histórias favoritas' : 'Minha estante'}
                  <span>.</span>
                </h1>
                <p className="muted">Um lugar para os livros que fazem parte de você.</p>
              </section>
            )}
            {page === 'discover' && (
              <div className="trust-strip">
                <span>
                  <BookOpen size={17} /> Um mundo de histórias
                </span>
                <span>
                  <ShieldCheck size={17} /> Fontes abertas e autorizadas
                </span>
                <span>
                  <Heart size={17} /> Uma estante com a sua cara
                </span>
              </div>
            )}
            <section className="catalog-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">
                    {page === 'discover' ? 'SUA PRÓXIMA LEITURA' : 'LIVROS QUE FICAM'}
                  </div>
                  <h2>
                    {page === 'discover'
                      ? searched
                        ? `Resultados para “${searched}”`
                        : 'Explore novas páginas'
                      : page === 'favorites'
                        ? 'Seus favoritos'
                        : 'Cada livro, um momento'}
                    <span>.</span>
                  </h2>
                </div>
                <div className="result-count">
                  {filtered.length} {filtered.length === 1 ? 'livro' : 'livros'}{' '}
                  <SlidersHorizontal size={17} />
                </div>
              </div>
              <div className="filters">
                <div className="filter-tabs">
                  <button
                    className={filter === 'all' ? 'selected' : ''}
                    onClick={() => {
                      setFilter('all');
                      setPagination(1);
                    }}
                  >
                    Todos os livros
                  </button>
                  <button
                    className={filter === 'pdf' ? 'selected' : ''}
                    onClick={() => {
                      setFilter('pdf');
                      setPagination(1);
                    }}
                  >
                    <Download size={14} /> PDF disponível
                  </button>
                </div>
                <div className="select-filters">
                  <select
                    aria-label="Idioma"
                    value={lang}
                    onChange={(e) => {
                      setLang(e.target.value);
                      setPagination(1);
                    }}
                  >
                    <option value="">Todos os idiomas</option>
                    {Array.from(new Set(base.map((b) => b.language).filter(Boolean))).map((l) => (
                      <option key={l} value={l}>
                        {(
                          {
                            pt: 'Português',
                            en: 'Inglês',
                            es: 'Espanhol',
                            fr: 'Francês',
                          } as any
                        )[l!] || l}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Categoria"
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setPagination(1);
                    }}
                  >
                    <option value="">Todas as categorias</option>
                    {Array.from(new Set(base.map((b) => b.category).filter(Boolean))).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {reports.length > 0 && (
                <details className="provider-status">
                  <summary>
                    {reports.some((p) => !p.ok)
                      ? 'Busca incompleta · algumas fontes não responderam'
                      : 'Busca concluída'}{' '}
                    <span>
                      {reports.filter((p) => p.ok).length} de {reports.length} fontes consultadas
                    </span>
                  </summary>
                  <div>
                    {reports.map((p) => (
                      <span key={p.name} title={p.message}>
                        {p.ok ? '✓' : '!'} {p.name}: {p.ok ? `${p.count} resultados` : p.message}
                      </span>
                    ))}
                  </div>
                </details>
              )}
              {loading ? (
                <div className="loading">
                  <LoaderCircle className="spin" />
                  <h3>Procurando sua próxima história…</h3>
                  <p>Consultando bibliotecas e repositórios. Isso pode levar alguns segundos.</p>
                </div>
              ) : filtered.length ? (
                <div className="book-grid">
                  {filtered.slice((pagination - 1) * 12, pagination * 12).map((b, i) => (
                    <article className="book-card" key={b.id}>
                      <div className={'cover-stage tone-' + (i % 5)}>
                        <button
                          className="cover-button"
                          onClick={() => open(b)}
                          aria-label={'Ver ' + b.title}
                        >
                          {safeUrl(b.cover) ? (
                            <img
                              src={b.cover}
                              alt={'Capa de ' + b.title}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div
                            className={'typographic-cover ' + (safeUrl(b.cover) ? 'hidden' : '')}
                          >
                            <small>{b.authors || 'UMA NOVA DESCOBERTA'}</small>
                            <strong>{b.title}</strong>
                            <BookOpen size={28} />
                            <small>{b.origin}</small>
                          </div>
                        </button>
                        <button
                          className={
                            'favorite ' +
                            (shelf.find((s) => s.id === b.id)?.favorite ? 'is-favorite' : '')
                          }
                          aria-label={'Favoritar ' + b.title}
                          onClick={() =>
                            save(b, undefined, !shelf.find((s) => s.id === b.id)?.favorite)
                          }
                        >
                          <Heart size={16} />
                        </button>
                        {b.available && (
                          <span className="cover-pdf">
                            <Check size={12} /> PDF disponível
                          </span>
                        )}
                      </div>
                      <div className="book-info">
                        <small>{b.category?.split('/')[0] || b.origin}</small>
                        <button className="book-title" onClick={() => open(b)}>
                          {b.title}
                        </button>
                        <p>{b.authors || 'Autoria não informada'}</p>
                        <div className="book-bottom">
                          <span>{b.language?.toUpperCase() || 'IDIOMA NÃO INFORMADO'}</span>
                          <button onClick={() => (b.available ? open(b) : request(b))}>
                            {b.available ? 'Ver livro' : 'Solicitar livro'}{' '}
                            <ArrowUpRight size={14} />
                          </button>
                        </div>
                        {(page === 'shelf' || page === 'favorites') && (
                          <select
                            aria-label={'Estado de leitura de ' + b.title}
                            value={b.state || 'want'}
                            onChange={(e) => save(b, e.target.value as Book['state'])}
                          >
                            <option value="want">Quero ler</option>
                            <option value="reading">Lendo</option>
                            <option value="read">Lido</option>
                          </select>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={<BookOpen size={32} />}
                  title={
                    searched
                      ? 'Ainda não encontramos essa história.'
                      : page === 'discover'
                        ? 'Qual será o seu próximo capítulo?'
                        : 'Uma estante pronta para suas histórias.'
                  }
                  text={
                    searched
                      ? 'Sua consulta foi preservada. Você pode completar os dados e acompanhar uma nova busca.'
                      : 'Pesquise um título ou autor para começar. Os livros encontrados passam a fazer parte deste catálogo.'
                  }
                />
              )}
              {page === 'discover' && webLeads.length > 0 && (
                <section className="web-results" aria-label="Resultados da busca na web">
                  <h3>Encontrados na web</h3>
                  <p className="muted">
                    Páginas relacionadas ao livro. Um link encontrado não confirma a disponibilidade
                    de um PDF autorizado.
                  </p>
                  {webLeads.map((lead) => (
                    <article className="source-card" key={lead.url}>
                      <a
                        className="official-link"
                        href={safeUrl(lead.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {lead.title.replace(/<[^>]*>/g, '')} <ArrowUpRight size={15} />
                      </a>
                      <p>{lead.description.replace(/<[^>]*>/g, '')}</p>
                    </article>
                  ))}
                </section>
              )}
              {filtered.length > 12 && (
                <div className="pagination">
                  <button
                    disabled={pagination === 1}
                    onClick={() => setPagination((p) => p - 1)}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span>
                    {pagination} / {Math.ceil(filtered.length / 12)}
                  </span>
                  <button
                    disabled={pagination * 12 >= filtered.length}
                    onClick={() => setPagination((p) => p + 1)}
                    aria-label="Próxima página"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
              {page === 'discover' && !searched && books.length >= 24 && moreCatalog && (
                <div className="pagination">
                  <button
                    className="button outline"
                    onClick={async () => {
                      try {
                        const next = await api<Book[]>('/books?page=' + (catalogPage + 1));
                        setBooks((current) => [
                          ...current,
                          ...next.filter((b) => !current.some((c) => c.id === b.id)),
                        ]);
                        setCatalogPage((p) => p + 1);
                        setMoreCatalog(next.length === 24);
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    Carregar mais livros <Plus size={15} />
                  </button>
                </div>
              )}
              {page === 'discover' && (
                <div className="request-banner">
                  <div className="banner-icon">
                    <Sparkles size={26} />
                  </div>
                  <div>
                    <h3>Algumas histórias merecem uma busca a mais.</h3>
                    <p>Não encontrou o livro que queria? Conte para a gente. Vamos procurar.</p>
                  </div>
                  <button
                    className="button outline"
                    onClick={() => (user ? setCorrection(true) : setLogin(true))}
                  >
                    Solicitar um livro <Plus size={17} />
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <footer>
        <a className="brand footer-brand" href="#" onClick={() => navigate('discover')}>
          <BookOpen size={22} /> entre páginas
        </a>
        <span>Feito com carinho, para quem se encontra nos livros.</span>
        <small>
          LEIA. SONHE. RECOMECE. <Heart size={13} />
        </small>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={20} />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {login && (
        <Modal title="Seu cantinho de leitura" close={() => setLogin(false)}>
          <p className="muted">Entre para guardar histórias e acompanhar seus pedidos.</p>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const r = await api('/login', {
                  email: f.get('email'),
                  password: f.get('password'),
                });
                setUser(r.user);
                setLogin(false);
                setError('');
              } catch (e) {
                fail(e);
              }
            }}
          >
            <label>
              E-mail
              <input type="email" name="email" autoComplete="username" required />
            </label>
            <label>
              Senha
              <input type="password" name="password" autoComplete="current-password" required />
            </label>
            <button className="button" type="submit">
              Entrar <ArrowRight size={17} />
            </button>
            <small>Este é um espaço pessoal. Peça uma conta ao administrador.</small>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
      {detail && (
        <Modal title="Mais uma história para você" close={() => setDetail(null)} wide>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="detail-grid">
            <div className="detail-cover">
              {safeUrl(detail.cover) ? (
                <img src={detail.cover} alt={'Capa de ' + detail.title} />
              ) : (
                <BookOpen size={80} />
              )}
            </div>
            <div>
              <span className="eyebrow">{detail.origin}</span>
              <h2>{detail.title}</h2>
              <p>{detail.authors || 'Autoria não informada'}</p>
              <span className={'badge ' + (detail.available ? 'green' : '')}>
                {detail.available ? 'PDF disponível' : 'Catalogado · sem PDF validado'}
              </span>
              <p className="synopsis">
                {detail.description?.replace(/<[^>]*>/g, '') ||
                  'Esta fonte ainda não forneceu uma sinopse para o livro.'}
              </p>
              <dl>
                <dt>Idioma</dt>
                <dd>{detail.language || 'Não informado'}</dd>
                <dt>Edição</dt>
                <dd>{detail.edition || 'A confirmar'}</dd>
                <dt>ISBN</dt>
                <dd>{detail.isbn || 'Não informado'}</dd>
              </dl>
              <div className="detail-actions">
                {detail.available ? (
                  detail.sources?.map((s) => (
                    <button
                      className="button"
                      key={s.id}
                      onClick={async () => {
                        if (!user) {
                          setLogin(true);
                          return;
                        }
                        try {
                          const r = await fetch('/api/download/' + s.id);
                          if (!r.ok) throw new Error((await r.json()).error);
                          const u = URL.createObjectURL(await r.blob());
                          const a = document.createElement('a');
                          a.href = u;
                          a.download = detail.title + '.pdf';
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(u), 10000);
                        } catch (e) {
                          fail(e);
                        }
                      }}
                    >
                      <Download size={16} /> Baixar PDF · {s.origin}
                    </button>
                  ))
                ) : (
                  <button className="button" onClick={() => request(detail)}>
                    Solicitar livro <Plus size={16} />
                  </button>
                )}
                <button className="button outline" onClick={() => save(detail, 'want')}>
                  <Library size={16} /> Quero ler
                </button>
              </div>
              {detail.sources?.map((s) => (
                <p className="source-note" key={s.id}>
                  Licença: {s.license} · Região: {s.region} ·{' '}
                  <a href={safeUrl(s.evidence_url)} target="_blank" rel="noreferrer">
                    Ver origem e autorização ↗
                  </a>
                </p>
              ))}
              {safeUrl(detail.official_url) && (
                <a
                  className="official-link"
                  href={detail.official_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Consultar ficha na fonte oficial <ArrowUpRight size={15} />
                </a>
              )}
            </div>
          </div>
        </Modal>
      )}
      {correction && (
        <Modal title="Que livro está procurando?" close={() => setCorrection(false)}>
          <p className="muted">Se os resultados não correspondem, complete o que souber.</p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api('/requests', {
                  query: f.get('query'),
                  title: f.get('title') || undefined,
                  author: f.get('author') || undefined,
                  language: f.get('language') || undefined,
                });
                setCorrection(false);
                notify('Registramos seu pedido. Acompanhe em Minhas solicitações.');
              } catch (e) {
                fail(e);
              }
            }}
          >
            <label>
              Sua busca
              <input name="query" defaultValue={searched} required minLength={2} />
            </label>
            <label>
              Título (se souber)
              <input name="title" />
            </label>
            <label>
              Autor (se souber)
              <input name="author" />
            </label>
            <label>
              Idioma
              <select name="language">
                <option value="">Não sei</option>
                <option value="pt">Português</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
              </select>
            </label>
            <button className="button">
              Registrar pedido <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
