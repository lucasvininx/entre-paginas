export const normalize = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const isbn = (v: string) => v.replace(/[^0-9Xx]/g, '').toUpperCase();
export function identity(b: {
  isbn?: string | null;
  title: string;
  authors: string;
  language?: string | null;
  edition?: string | null;
  origin: string;
  externalId?: string;
}) {
  return b.isbn
    ? `isbn:${isbn(b.isbn)}:${b.language || '?'}:${b.edition || '?'}`
    : b.language && b.edition && b.authors
      ? `edition:${normalize(b.title)}|${normalize(b.authors)}|${b.language}|${normalize(b.edition)}`
      : `${b.origin}:${b.externalId || normalize(b.title) + '|' + normalize(b.authors)}:${b.language || '?'}:${b.edition || '?'}`;
}
