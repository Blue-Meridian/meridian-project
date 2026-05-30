export const fmtMillions = (n: number, decimals = 1) =>
  `$${(n / 1e6).toFixed(decimals)}M`;

export const fmtTonnes = (n: number) => `${n.toLocaleString()} t`;

export const fmtNumber = (n: number) => n.toLocaleString();

export const fmtCommunityId = (display: string) =>
  display
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
