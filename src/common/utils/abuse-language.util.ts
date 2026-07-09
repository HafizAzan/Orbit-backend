const ABUSE_PATTERNS: RegExp[] = [
  /\bf+u+c+k+(?:ing|er|ed)?\b/i,
  /\bsh+i+t+(?:ty|ting)?\b/i,
  /\bass+h+ole+s?\b/i,
  /\bb+i+t+c+h+(?:es|ing)?\b/i,
  /\bd+i+c+k+s?\b/i,
  /\bp+u+s+s+y+\b/i,
  /\bc+u+n+t+s?\b/i,
  /\bn+i+g+g+(?:a|er)s?\b/i,
  /\bf+a+g+g?(?:ot)?s?\b/i,
  /\bslut+s?\b/i,
  /\bwhore+s?\b/i,
  /\bbastard+s?\b/i,
  /\bdumbass+\b/i,
  /\bmotherf+u+c+k+er+s?\b/i,
  /\bgaali\b/i,
  /\bmadarchod\b/i,
  /\bbehenchod\b/i,
  /\bbhenchod\b/i,
  /\bchodu\b/i,
  /\bchutiya\b/i,
  /\bchutiy[ae]\b/i,
  /\bharaami\b/i,
  /\bharami\b/i,
  /\bkutta\b/i,
  /\bkutiya\b/i,
  /\braand\b/i,
  /\blund\b/i,
  /\bbhosdike\b/i,
  /\bbhosdi\b/i,
];

export function containsAbusiveLanguage(text: string | null | undefined): boolean {
  if (!text?.trim()) {
    return false;
  }

  const normalized = text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return ABUSE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function findAbusiveFields(
  fields: Record<string, string | null | undefined>,
): string[] {
  return Object.entries(fields)
    .filter(([, value]) => containsAbusiveLanguage(value))
    .map(([key]) => key);
}
