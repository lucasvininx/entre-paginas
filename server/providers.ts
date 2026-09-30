import { safeFetch } from './safe-fetch.ts';
import { identity } from './normalize.ts';
import { sql } from './db.ts';
import { webDiscovery, type WebLead } from './web-discovery.ts';
export type Candidate = {
  url: string;
  license: string;
  evidence_url: string;
  region: string;
};
export type Book = {
  id?: string;
  externalId: string;
  title: string;
  authors: string;
  isbn?: string;
  language?: string;
  edition?: string;
  category?: string;
  description?: string;
  cover?: string;
  origin: string;
  official_url?: string;
  candidates: Candidate[];
  warning?: string;
};
const json = async (url: string) => JSON.parse((await safeFetch(url, 6_000_000)).body.toString());
const arr = (v: any): string[] => (!v ? [] : Array.isArray(v) ? v : [String(v)]);
const language = (v: string) =>
  ({
    por: 'pt',
    eng: 'en',
    spa: 'es',
    fre: 'fr',
    Portuguese: 'pt',
    English: 'en',
    Spanish: 'es',
  })[v] || v;
export const providers: Record<string, (q: string) => Promise<Book[]>> = {
  'Open Library': async (q) => {
    const r = await json(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=20&fields=key,title,author_name,cover_i,edition_key&lang=pt`,
    );
    return r.docs.map((d: any) => ({
      externalId: d.key,
      title: d.title,
      authors: arr(d.author_name).join(', '),
      origin: 'Open Library',
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
      official_url: `https://openlibrary.org${d.key}`,
      candidates: [],
    }));
  },
  'Google Books': async (q) => {
    const r = await json(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20&country=${process.env.REGION || 'BR'}${process.env.GOOGLE_BOOKS_KEY ? '&key=' + encodeURIComponent(process.env.GOOGLE_BOOKS_KEY) : ''}`,
    );
    return (r.items || []).map((d: any) => {
      const v = d.volumeInfo,
        a = d.accessInfo || {};
      return {
        externalId: d.id,
        title: v.title,
        authors: arr(v.authors).join(', '),
        isbn: v.industryIdentifiers?.find((i: any) => i.type === 'ISBN_13')?.identifier,
        language: v.language,
        edition: [v.publisher, v.publishedDate].filter(Boolean).join(' · '),
        category: v.categories?.[0],
        description: v.description,
        cover: v.imageLinks?.thumbnail?.replace('http:', 'https:'),
        origin: 'Google Books',
        official_url: v.infoLink?.replace('http:', 'https:'),
        candidates:
          a.publicDomain &&
          a.country === (process.env.REGION || 'BR') &&
          a.viewability === 'ALL_PAGES' &&
          a.pdf?.downloadLink &&
          !a.downloadAccess?.restricted
            ? [
                {
                  url: a.pdf.downloadLink.replace('http:', 'https:'),
                  license: 'Domínio público conforme Google Books; revisão regional necessária',
                  evidence_url: `https://www.googleapis.com/books/v1/volumes/${d.id}`,
                  region: a.country,
                },
              ]
            : [],
      };
    });
  },
  'Project Gutenberg': async (q) => {
    const r = await json(`https://gutendex.com/books/?search=${encodeURIComponent(q)}`);
    return (r.results || []).slice(0, 12).map((d: any) => ({
      externalId: String(d.id),
      title: d.title,
      authors: (d.authors || []).map((a: any) => a.name).join(', '),
      language: language(d.languages?.[0]),
      category: d.subjects?.[0],
      origin: 'Project Gutenberg',
      cover: d.formats?.['image/jpeg'],
      official_url: `https://www.gutenberg.org/ebooks/${d.id}`,
      candidates:
        d.copyright === false && d.formats?.['application/pdf']
          ? [
              {
                url: d.formats['application/pdf'],
                license: 'Domínio público nos EUA; verificar Brasil',
                evidence_url: `https://www.gutenberg.org/ebooks/${d.id}`,
                region: 'US',
              },
            ]
          : [],
    }));
  },
  OAPEN: (q) => dspace('OAPEN', 'https://library.oapen.org', q),
  DOAB: (q) => dspace('DOAB', 'https://directory.doabooks.org', q),
  'Internet Archive': async (q) => {
    const r = await json(
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent('mediatype:texts AND (' + q.replace(/[():"\\]/g, ' ') + ')')}&output=json&rows=12&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=language&fl[]=licenseurl`,
    );
    const docs = r.response?.docs || [];
    const books: Book[] = docs.map((d: any) => ({
      externalId: d.identifier,
      title: d.title,
      authors: arr(d.creator).join(', '),
      language: language(arr(d.language)[0]),
      origin: 'Internet Archive',
      official_url: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
      candidates: [],
    }));
    const licensed = docs
      .filter((d: any) =>
        arr(d.licenseurl).some((l) => /^https?:\/\/creativecommons.org\/licenses\//i.test(l)),
      )
      .slice(0, 3);
    await Promise.all(
      licensed.map(async (d: any) => {
        const book = books.find((b) => b.externalId === d.identifier)!;
        try {
          const item = await json(
            `https://archive.org/metadata/${encodeURIComponent(d.identifier)}`,
          );
          if (item.is_dark || item.metadata?.access_restricted === 'true') return;
          const license = arr(item.metadata?.licenseurl).find((l) =>
            /^https?:\/\/creativecommons.org\/licenses\//i.test(l),
          );
          if (!license) return;
          book.edition = arr(item.metadata?.date)[0];
          book.candidates = (item.files || [])
            .filter(
              (f: any) =>
                f.source === 'original' &&
                /\.pdf$/i.test(f.name) &&
                !f.private &&
                !/sample|preview|excerpt/i.test(f.name),
            )
            .slice(0, 2)
            .map((f: any) => ({
              url: `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(f.name)}`,
              license,
              evidence_url: `https://archive.org/metadata/${encodeURIComponent(d.identifier)}`,
              region: 'WORLD',
            }));
        } catch (e) {
          book.warning =
            'Metadados encontrados, mas a inspeção dos arquivos falhou: ' + (e as Error).message;
        }
      }),
    );
    return books;
  },
};
async function dspace(origin: string, base: string, q: string): Promise<Book[]> {
  const rows = await json(
    `${base}/rest/search?query=${encodeURIComponent(q)}&expand=metadata,bitstreams&limit=8`,
  );
  return rows.flatMap((d: any) => {
    const get = (k: string) =>
      arr(d.metadata?.filter((m: any) => m.key === k).map((m: any) => m.value));
    const title = get('dc.title')[0];
    if (!title || get('dc.type').some((v) => /chapter|grantor|article/i.test(v))) return [];
    const rights = get('dc.rights.uri')[0] || get('dc.rights')[0] || '';
    return [
      {
        externalId: d.uuid,
        title,
        authors: get('dc.contributor.author').concat(get('dc.contributor.editor')).join(', '),
        isbn: get('dc.identifier.isbn')[0],
        language: language(get('dc.language')[0] || get('dc.language.iso')[0]),
        edition: get('dc.date.issued')[0],
        category: get('dc.subject')[0],
        description: get('dc.description.abstract')[0],
        origin,
        official_url: `${base}/handle/${d.handle}`,
        candidates: (d.bitstreams || [])
          .filter((b: any) => b.bundleName === 'ORIGINAL' && b.mimeType === 'application/pdf')
          .map((b: any) => ({
            url: new URL(b.retrieveLink, base).href,
            license: b.metadata?.find((m: any) => m.key === 'dc.rights.uri')?.value || rights,
            evidence_url: `${base}/rest/items/${d.uuid}?expand=metadata`,
            region: 'WORLD',
          }))
          .filter((c: Candidate) => /creativecommons.org|CC.BY|CC0/i.test(c.license)),
      },
    ];
  });
}
if (process.env.OPENALEX_API_KEY)
  providers['OpenAlex'] = async (q) => {
    const r = await json(
      `https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=type:book&per-page=15&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY!)}`,
    );
    return r.results.map((d: any) => ({
      externalId: d.id,
      title: d.title,
      authors: d.authorships.map((a: any) => a.author.display_name).join(', '),
      language: d.language,
      edition: String(d.publication_year),
      origin: 'OpenAlex',
      official_url: d.doi || d.id,
      candidates: (d.locations || [])
        .filter((l: any) => l.is_oa && l.pdf_url && l.license)
        .map((l: any) => ({
          url: l.pdf_url,
          license: l.license,
          evidence_url: l.landing_page_url || d.id,
          region: 'WORLD',
        })),
    }));
  };
const pending = new Map<string, Promise<any>>();
const providerNextStart = new Map<string, number>();
async function limitedProvider(name: string, fn: (q: string) => Promise<Book[]>, q: string) {
  const next = Math.max(Date.now(), providerNextStart.get(name) || 0);
  providerNextStart.set(name, next + 1100);
  if (next > Date.now()) await new Promise((r) => setTimeout(r, next - Date.now()));
  return fn(q);
}
let active = 0;
export async function discover(
  q: string,
  fresh = false,
): Promise<{
  books: Book[];
  leads?: WebLead[];
  providers: { name: string; ok: boolean; count: number; message?: string }[];
}> {
  const key = q.toLocaleLowerCase().trim();
  if (!fresh) {
    const [cache] = await sql('select data from search_cache where key=$1 and expires_at>now()', [
      key,
    ]);
    if (cache) return cache.data;
  }
  if (pending.has(key)) return pending.get(key)!;
  if (active >= 3) throw new Error('Busca ocupada. Tente novamente em instantes.');
  const task = (async () => {
    active++;
    try {
      const entries = Object.entries(providers);
      const settled = await Promise.allSettled(
        entries.map(([name, fn]) => limitedProvider(name, fn, q)),
      );
      const books: Book[] = [];
      const reports = settled.map((r, i) => {
        if (r.status === 'fulfilled') {
          books.push(...r.value);
          const warning = r.value.find((b) => b.warning)?.warning;
          return {
            name: entries[i][0],
            ok: !warning,
            count: r.value.length,
            ...(warning ? { message: warning } : {}),
          };
        }
        return {
          name: entries[i][0],
          ok: false,
          count: 0,
          message: String(r.reason?.message || r.reason),
        };
      });
      let leads: WebLead[] = [];
      if (process.env.BRAVE_SEARCH_KEY) {
        try {
          leads = await webDiscovery(q);
          reports.push({ name: 'Busca web', ok: true, count: leads.length });
        } catch (e) {
          reports.push({ name: 'Busca web', ok: false, count: 0, message: (e as Error).message });
        }
      }
      const result = { books, providers: reports, leads };
      await sql(
        "insert into search_cache(key,data,expires_at) values($1,$2,now()+interval '15 minutes') on conflict(key) do update set data=$2,expires_at=excluded.expires_at",
        [key, JSON.stringify(result)],
      );
      return result;
    } finally {
      active--;
      pending.delete(key);
    }
  })();
  pending.set(key, task);
  return task;
}
export async function catalog(b: Book) {
  const [row] = await sql(
    `insert into books(identity,title,authors,isbn,language,edition,category,description,cover,origin,official_url) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(identity) do update set description=coalesce(excluded.description,books.description),cover=coalesce(excluded.cover,books.cover) returning *`,
    [
      identity(b),
      b.title,
      b.authors,
      b.isbn || null,
      b.language || null,
      b.edition || null,
      b.category || null,
      b.description || null,
      b.cover || null,
      b.origin,
      b.official_url || null,
    ],
  );
  for (const c of b.candidates)
    await sql(
      `insert into sources(book_id,url,origin,evidence_url,license,region,title,authors,language,edition) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(book_id,url) do nothing`,
      [
        row.id,
        c.url,
        b.origin,
        c.evidence_url,
        c.license,
        c.region,
        b.title,
        b.authors,
        b.language || null,
        b.edition || null,
      ],
    );
  return row;
}
