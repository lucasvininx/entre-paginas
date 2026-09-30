import { useEffect, useState } from 'react';
import {
  Search,
  BookOpen,
  Download,
  Clock,
  Activity,
  ArrowRight,
  RefreshCw,
  Plus,
  Check,
  Users,
  ExternalLink,
} from 'lucide-react';
import { api, safeUrl } from '../api';
import { Modal } from '../components/Modal';
import { statuses } from '../status';
import type { RequestRow, Source } from '../types';
export function Admin({
  notify,
  fail,
}: {
  notify: (s: string) => void;
  fail: (e: unknown) => void;
}) {
  const [rows, setRows] = useState<RequestRow[]>([]),
    [counts, setCounts] = useState({ books: 0, pdfs: 0, pending: 0, jobs: 0 }),
    [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [language, setLanguage] = useState(''),
    [priority, setPriority] = useState(''),
    [after, setAfter] = useState(''),
    [selected, setSelected] = useState<any>(null),
    [create, setCreate] = useState(false),
    [source, setSource] = useState(false),
    [busy, setBusy] = useState(false),
    [adminError, setAdminError] = useState('');
  const failure = (e: unknown) => {
    setAdminError(e instanceof Error ? e.message : String(e));
    fail(e);
  };
  async function load() {
    try {
      const [r, c] = await Promise.all([
        api<RequestRow[]>(
          '/admin/requests?' +
            new URLSearchParams({
              q,
              status,
              language,
              ...(priority ? { priority } : {}),
              ...(after ? { after } : {}),
            }),
        ),
        api('/admin/overview'),
      ]);
      setRows(r);
      setCounts(c);
    } catch (e) {
      failure(e);
    }
  }
  async function open(id: string) {
    try {
      setSelected(await api('/admin/requests/' + id));
      setAdminError('');
    } catch (e) {
      failure(e);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 7000);
    return () => clearInterval(timer);
  }, [status, language, priority, after]);
  async function action(fn: () => Promise<any>, message: string, refresh = true) {
    setBusy(true);
    setAdminError('');
    try {
      await fn();
      notify(message);
      await load();
      if (selected && refresh) await open(selected.request.id);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin inner">
      <div className="section-heading">
        <div>
          <div className="eyebrow">CUIDANDO DE CADA HISTÓRIA</div>
          <h1>
            Painel da biblioteca<span>.</span>
          </h1>
          <p className="muted">Da primeira busca ao próximo livro na estante.</p>
        </div>
        <button className="button outline" onClick={() => setCreate(true)}>
          <Users size={16} /> Criar leitor
        </button>
      </div>
      <div className="stats">
        {[
          [BookOpen, counts.books, 'Livros catalogados'],
          [Download, counts.pdfs, 'Livros com PDF'],
          [Clock, counts.pending, 'Solicitações em aberto'],
          [Activity, counts.jobs, 'Buscas na fila / em andamento'],
        ].map(([Icon, n, label]: any) => (
          <div className="stat" key={label}>
            <Icon size={20} />
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="section-heading">
        <h2>
          Uma nova chance de encontrar<span>.</span>
        </h2>
        <button className="icon-btn" onClick={load} aria-label="Atualizar painel">
          <RefreshCw size={18} />
        </button>
      </div>
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Filtrar solicitações"
            placeholder="Título, autor ou consulta…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(statuses).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          aria-label="Idioma das solicitações"
          placeholder="Idioma (pt, en)"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        />
        <select
          aria-label="Prioridade"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">Prioridades</option>
          {[0, 1, 2, 3].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label="Solicitações desde"
          value={after}
          onChange={(e) => setAfter(e.target.value)}
        />
        <button className="button small">Filtrar</button>
      </form>
      <div className="table-wrap">
        <table className="requests-table" role="table" aria-label="Solicitações da biblioteca">
          <thead>
            <tr>
              <th>LIVRO / CONSULTA</th>
              <th>STATUS</th>
              <th>INTERESSADOS</th>
              <th>PRIORIDADE</th>
              <th>ÚLTIMO PEDIDO</th>
              <th />
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((r) => (
              <tr key={r.id} role="row">
                <td data-label="Livro / consulta" role="cell">
                  <strong>{r.title || r.query}</strong>
                  <small>
                    {r.author || 'A identificar'}
                    {r.language ? ' · ' + r.language.toUpperCase() : ''}
                  </small>
                </td>
                <td data-label="Status" role="cell">
                  <span className={'badge ' + (r.status === 'available' ? 'green' : '')}>
                    {statuses[r.status] || r.status}
                  </span>
                </td>
                <td data-label="Interessados" role="cell">
                  {r.interested}
                </td>
                <td data-label="Prioridade" role="cell">
                  {['Normal', 'Baixa', 'Média', 'Alta'][r.priority]}
                </td>
                <td data-label="Último pedido" role="cell">
                  {new Date(r.last_at).toLocaleDateString('pt-BR')}
                </td>
                <td data-label="Ações" role="cell">
                  <button className="text-button" onClick={() => open(r.id)}>
                    Revisar <ArrowRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <BookOpen />
            <h3>Nenhuma solicitação por aqui.</h3>
            <p>As buscas dos leitores chegam automaticamente neste painel.</p>
          </div>
        )}
      </div>
      {selected && (
        <Modal title="Revisar solicitação" close={() => setSelected(null)} wide>
          <h2>{selected.request.title || selected.request.query}</h2>
          <p className="muted">Consulta original: {selected.request.query}</p>
          <div className="admin-detail-actions">
            <span className="badge">{statuses[selected.request.status]}</span>
            <button
              className="button small"
              disabled={busy || ['searching', 'available'].includes(selected.request.status)}
              onClick={() =>
                action(
                  () => api('/admin/requests/' + selected.request.id + '/search', {}),
                  'Busca adicionada à fila. Os resultados aparecerão nesta solicitação.',
                )
              }
            >
              <Search size={16} /> Buscar agora
            </button>
            <button className="button outline small" onClick={() => setSource(true)}>
              <Plus size={16} /> Adicionar fonte autorizada
            </button>
            <button
              className="icon-btn"
              aria-label="Atualizar solicitação"
              onClick={() => open(selected.request.id)}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          {adminError && (
            <p className="form-error" role="alert">
              {adminError}
            </p>
          )}
          <details className="edit-details">
            <summary>Corrigir dados, prioridade e observações</summary>
            <form
              className="stack-form two-col"
              key={selected.request.id + selected.request.status}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action(
                  () =>
                    api(
                      '/admin/requests/' + selected.request.id,
                      Object.fromEntries(
                        [
                          'title',
                          'author',
                          'isbn',
                          'language',
                          'edition',
                          'notes',
                          'status',
                          'priority',
                        ].map((k) => [
                          k,
                          k === 'priority'
                            ? Number(f.get(k))
                            : k === 'notes'
                              ? String(f.get(k) || '')
                              : f.get(k) || null,
                        ]),
                      ),
                      'PATCH',
                    ),
                  'Solicitação atualizada.',
                );
              }}
            >
              {[
                ['title', 'Título'],
                ['author', 'Autor'],
                ['isbn', 'ISBN'],
                ['language', 'Idioma'],
                ['edition', 'Edição'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input name={key} defaultValue={selected.request[key] || ''} />
                </label>
              ))}
              <label>
                Prioridade
                <select name="priority" defaultValue={selected.request.priority}>
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  name="status"
                  defaultValue={
                    ['searching', 'available'].includes(selected.request.status)
                      ? 'pending'
                      : selected.request.status
                  }
                >
                  {Object.entries(statuses)
                    .filter(([s]) => !['searching', 'available'].includes(s))
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Observações / motivo
                <textarea name="notes" defaultValue={selected.request.notes} />
              </label>
              <button className="button small" disabled={busy}>
                Salvar alterações
              </button>
            </form>
          </details>
          <h3 className="subheading">Candidatos e validação</h3>
          <p className="muted small-text">
            A validação técnica não confirma o conteúdo editorial. Compare o arquivo completo,
            autoria, edição, idioma e licença antes de aprovar.
          </p>
          {selected.sources.length ? (
            selected.sources.map((s: Source) => (
              <article className="source-card" key={s.id}>
                <div className="section-heading">
                  <h4>{s.title}</h4>
                  <span className={'badge ' + (s.status === 'approved' ? 'green' : '')}>
                    {s.status}
                  </span>
                </div>
                <p>
                  {s.authors} · {s.language || 'Idioma a confirmar'} ·{' '}
                  {s.edition || 'Edição a confirmar'}
                </p>
                <p>
                  {s.origin} · {s.region} · {s.license}
                </p>
                <p className={s.validation?.ok ? 'validation-ok' : 'muted'}>
                  {s.validation?.message || 'Aguardando validação técnica'}
                </p>
                <div className="source-actions">
                  <a href={safeUrl(s.evidence_url)} target="_blank" rel="noreferrer">
                    Ver autorização <ExternalLink size={13} />
                  </a>
                  <a href={safeUrl(s.url)} target="_blank" rel="noreferrer">
                    Inspecionar arquivo <ExternalLink size={13} />
                  </a>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      action(
                        () => api('/admin/sources/' + s.id + '/validate', {}),
                        'Validação concluída. Confira o resultado.',
                      )
                    }
                  >
                    <RefreshCw size={13} /> Revalidar
                  </button>
                </div>
                {s.status !== 'approved' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(
                        () =>
                          api('/admin/sources/' + s.id + '/approve', {
                            confirmed: true,
                            requestId: selected.request.id,
                          }),
                        'PDF aprovado. Os interessados foram avisados.',
                      );
                    }}
                  >
                    <label className="checkbox">
                      <input type="checkbox" required /> Conferi o livro completo, a edição, o
                      idioma e a autorização para esta região.
                    </label>
                    <button className="button small" disabled={busy || s.status !== 'validated'}>
                      <Check size={15} /> Aprovar e disponibilizar
                    </button>
                  </form>
                )}
              </article>
            ))
          ) : (
            <p className="muted">
              Nenhum PDF candidato nesta solicitação. Inicie uma busca ou adicione uma fonte.
            </p>
          )}
          <h3 className="subheading">Histórico de buscas</h3>
          {selected.jobs.map((j: any) => (
            <div className="job-line" key={j.id}>
              {new Date(j.created_at).toLocaleString('pt-BR')} · {j.status} · tentativa {j.attempts}
              {j.result?.error && ' · ' + j.result.error}
              {j.result?.rejected?.map((r: any, i: number) => (
                <p key={i}>
                  {r.title}: {r.reason}
                </p>
              ))}
              {j.result?.leads?.map((l: any) => (
                <p key={l.url}>
                  <a href={safeUrl(l.url)} target="_blank" rel="noreferrer">
                    Pista da busca web: {l.title} ↗
                  </a>
                </p>
              ))}
            </div>
          ))}
          {selected.attempts.map((a: any) => (
            <details className="attempt" key={a.id}>
              <summary>
                {new Date(a.created_at).toLocaleString('pt-BR')} · {a.query}
              </summary>
              {a.providers.map((p: any) => (
                <p key={p.name}>
                  {p.ok ? '✓' : '!'} {p.name}: {p.ok ? p.count + ' resultados' : p.message}
                </p>
              ))}
            </details>
          ))}
          <details className="edit-details">
            <summary>Juntar solicitação duplicada</summary>
            <form
              className="stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                const targetId = new FormData(e.currentTarget).get('targetId');
                action(
                  async () => {
                    await api('/admin/requests/' + selected.request.id + '/merge', { targetId });
                    setSelected(null);
                  },
                  'Solicitações unidas sem duplicar interessados.',
                  false,
                );
              }}
            >
              <label>
                Pedido de destino
                <select name="targetId" required>
                  <option value="">Selecione</option>
                  {rows
                    .filter((r) => r.id !== selected.request.id)
                    .map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.title || r.query}
                      </option>
                    ))}
                </select>
              </label>
              <button className="button outline small" disabled={busy}>
                Juntar pedidos
              </button>
            </form>
          </details>
        </Modal>
      )}
      {source && selected && (
        <Modal title="Adicionar fonte autorizada" close={() => setSource(false)}>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await api('/admin/sources', {
                  ...Object.fromEntries(f.entries()),
                  requestId: selected.request.id,
                });
                setSource(false);
                await open(selected.request.id);
                notify('Fonte registrada e validada. Confira o resultado antes de aprovar.');
              } catch (e) {
                failure(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {[
              ['title', 'Título', selected.request.title],
              ['authors', 'Autor', selected.request.author],
              ['language', 'Idioma (pt, en...)', selected.request.language],
              ['edition', 'Edição', selected.request.edition],
              ['origin', 'Biblioteca / editora', ''],
              ['url', 'URL HTTPS do PDF', ''],
              ['evidence_url', 'URL HTTPS da autorização', ''],
              ['license', 'Licença / evidência de permissão', ''],
            ].map(([k, label, value]) => (
              <label key={k}>
                {label}
                <input
                  name={k!}
                  defaultValue={value || ''}
                  type={k === 'url' || k === 'evidence_url' ? 'url' : 'text'}
                  required
                />
              </label>
            ))}
            <label>
              Autorização válida em
              <select name="region">
                <option value="BR">Brasil</option>
                <option value="WORLD">Mundial (licença aberta)</option>
              </select>
            </label>
            {adminError && <p className="form-error">{adminError}</p>}
            <button className="button" disabled={busy}>
              {busy ? 'Validando…' : 'Validar fonte'}
            </button>
          </form>
        </Modal>
      )}
      {create && (
        <Modal title="Convidar para uma nova história" close={() => setCreate(false)}>
          <form
            className="stack-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api('/admin/users', Object.fromEntries(f.entries()));
                setCreate(false);
                notify('Conta de leitor criada. Compartilhe a senha de forma privada.');
              } catch (e) {
                failure(e);
              }
            }}
          >
            <label>
              Nome
              <input name="name" required minLength={2} />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required />
            </label>
            <label>
              Senha inicial (12 ou mais caracteres)
              <input
                name="password"
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            {adminError && <p className="form-error">{adminError}</p>}
            <button className="button">
              Criar conta de leitor <Plus size={16} />
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
