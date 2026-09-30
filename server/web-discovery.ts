// Optional web discovery returns leads, never book metadata or approved PDFs.
export const institutionalDomains = [
  'dominiopublico.gov.br',
  'bndigital.bn.gov.br',
  'digital.bbm.usp.br',
  'livros.scielo.org',
  'books.scielo.org',
  'livrosabertos.sibi.usp.br',
  'editoras.unesp.br',
  'repositorio.unicamp.br',
  'repositorio.unb.br',
  'lume.ufrgs.br',
  'arca.fiocruz.br',
  'educapes.capes.gov.br',
  'oapen.org',
  'doabooks.org',
  'openstax.org',
  'open.umn.edu',
  'open.bccampus.ca',
  'pressbooks.pub',
  'gutenberg.org',
  'standardebooks.org',
  'archive.org',
  'gallica.bnf.fr',
  'europeana.eu',
  'hathitrust.org',
  'wellcomecollection.org',
  'nap.nationalacademies.org',
  'mitpress.mit.edu',
  'openbookpublishers.com',
  'meson.press',
];
export type WebLead = { title: string; url: string; description: string };
export const webProvider = { search: webDiscovery };
export async function webDiscovery(query: string): Promise<WebLead[]> {
  if (!process.env.BRAVE_SEARCH_KEY)
    throw new Error('Busca na web aguardando configuração de BRAVE_SEARCH_KEY pelo administrador.');
  const r = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + ' PDF ebook')}&count=20`,
    {
      headers: { 'X-Subscription-Token': process.env.BRAVE_SEARCH_KEY },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!r.ok) throw new Error(`Busca web HTTP ${r.status}`);
  const result = (await r.json()) as any;
  return (result.web?.results || [])
    .map((v: any) => ({
      title: v.title,
      url: v.url,
      description: v.description,
    }))
    .filter((v: WebLead) => v.url.startsWith('https://'));
}
