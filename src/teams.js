// Lógica pura do Tira Time (sem DOM): leitura da lista, plano de times e sorteio equilibrado.

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;
export const DEFAULT_LEVEL = 3;
export const MAX_TEAMS = 10;
export const MAX_PLAYERS = 100;
export const MAX_NAME_LENGTH = 40;

export const TEAM_COLORS = Object.freeze([
  { name: 'Azul', color: '#2563eb' },
  { name: 'Vermelho', color: '#dc2626' },
  { name: 'Verde', color: '#16a34a' },
  { name: 'Amarelo', color: '#eab308' },
  { name: 'Laranja', color: '#ea580c' },
  { name: 'Roxo', color: '#7c3aed' },
  { name: 'Preto', color: '#111827' },
  { name: 'Branco', color: '#f3f4f6' },
  { name: 'Rosa', color: '#db2777' },
  { name: 'Cinza', color: '#6b7280' },
]);

export const DEFAULT_OPTIONS = Object.freeze({
  mode: 'teams', teams: 2, perTeam: 5, balance: true, separateKeepers: true, reserves: false,
});

export class TeamsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamsError';
  }
}

/* ---------- utilidades ---------- */

export function cryptoRandomInt(n) {
  const buf = new Uint32Array(1);
  const limit = 2 ** 32 - (2 ** 32 % n);
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

export function shuffle(items, randomInt) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

export function cleanName(name) {
  return String(name ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function nameKey(name) {
  return cleanName(name).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function parseLevel(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_LEVEL && n <= MAX_LEVEL ? n : null;
}

export const levelOf = (player) => player.level ?? DEFAULT_LEVEL;

/* ---------- lista colada ---------- */

const KEEPER_MARK = /[([]\s*(?:g|gk|gol|goleir[oa])\s*[)\]]|(?:^|\s)goleir[oa](?=\s|$|[-–—:,])|🧤/giu;
const ENUMERATION = /^\s*(?:\d{1,3}\s*[.)\-–—º°]|[-–—•*·])\s*/u;
const LEVEL_SUFFIXES = [
  /\s*[-–—:=]\s*(\d+)\s*(?:★|⭐|estrelas?)?\s*$/iu,
  /\s*\(\s*(\d+)\s*(?:★|⭐)?\s*\)\s*$/u,
  /\s+(\d+)\s*(?:★|⭐)\s*$/u,
];
const STARS = /\s*((?:★|⭐){1,10})\s*$/u;

/**
 * Lê uma linha como "Nome - 4", "Nome (G)", "3. Nome ⭐⭐⭐ goleiro".
 * Devolve null para linha vazia; { name, level, keeper, warning? } nos demais casos.
 */
export function parsePlayerLine(line) {
  // U+FE0F (seletor de variação) costuma vir grudado nos emojis copiados do WhatsApp.
  let text = String(line ?? '').normalize('NFC').replace(/\uFE0F/g, '').replace(ENUMERATION, '').trim();
  if (!text) return null;
  const keeper = text.search(KEEPER_MARK) !== -1;
  text = text.replace(KEEPER_MARK, ' ').replace(/\s+/g, ' ').trim();
  let level = null;
  let warning = null;
  for (const pattern of LEVEL_SUFFIXES) {
    const m = pattern.exec(text);
    if (!m) continue;
    const n = Number(m[1]);
    if (n >= MIN_LEVEL && n <= MAX_LEVEL) level = n;
    else warning = `nível ${n} fora da escala de ${MIN_LEVEL} a ${MAX_LEVEL} (ignorado)`;
    text = text.slice(0, m.index);
    break;
  }
  if (level === null && !warning) {
    const m = STARS.exec(text);
    if (m) {
      const n = [...m[1]].length;
      if (n <= MAX_LEVEL) level = n;
      else warning = `${n} estrelas (o máximo é ${MAX_LEVEL}; ignorado)`;
      text = text.slice(0, m.index);
    }
  }
  const name = cleanName(text.replace(/^[\s\-–—:=,]+|[\s\-–—:=,]+$/gu, ''));
  if (!name) return { name: '', level, keeper, warning: 'linha sem nome' };
  if (name.length > MAX_NAME_LENGTH) return { name: name.slice(0, MAX_NAME_LENGTH), level, keeper, warning: `nome cortado em ${MAX_NAME_LENGTH} caracteres` };
  return warning ? { name, level, keeper, warning } : { name, level, keeper };
}

/** Lê várias linhas; repetidos (ignorando maiúsculas e acentos) entram uma vez só. */
export function parsePlayerList(text) {
  const players = [];
  const warnings = [];
  const seen = new Set();
  String(text ?? '').split(/\r\n|\r|\n/).forEach((line, i) => {
    const parsed = parsePlayerLine(line);
    if (!parsed) return;
    const where = `Linha ${i + 1}`;
    if (!parsed.name) {
      warnings.push(`${where}: ${parsed.warning}.`);
      return;
    }
    if (parsed.warning) warnings.push(`${where} (${parsed.name}): ${parsed.warning}.`);
    const key = nameKey(parsed.name);
    if (seen.has(key)) {
      warnings.push(`${where}: ${parsed.name} apareceu de novo (ficou só uma vez).`);
      return;
    }
    seen.add(key);
    players.push({ name: parsed.name, level: parsed.level, keeper: parsed.keeper });
  });
  return { players, warnings };
}

/* ---------- plano de times ---------- */

function toInt(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  const s = String(value ?? '').trim();
  return /^\d{1,4}$/.test(s) ? Number(s) : NaN;
}

function balancedSizes(total, teams) {
  const base = Math.floor(total / teams);
  const extra = total % teams;
  return range(teams).map((i) => (i < extra ? base + 1 : base));
}

/**
 * Decide quantos times, o tamanho de cada um e quantas reservas.
 * mode "teams": número de times; mode "size": jogadores por time.
 * Sem reservas, todo mundo joga e os tamanhos diferem em no máximo 1.
 */
export function planTeams({ count, mode = 'teams', teams = 2, perTeam = 5, reserves = false }) {
  if (count < 2) throw new TeamsError('Marque pelo menos 2 jogadores presentes para sortear.');
  if (count > MAX_PLAYERS) throw new TeamsError(`O limite é de ${MAX_PLAYERS} jogadores por sorteio.`);
  let t;
  if (mode === 'size') {
    const size = toInt(perTeam);
    if (!(size >= 1 && size <= 50)) throw new TeamsError('Informe quantos jogadores por time (de 1 a 50).');
    t = Math.floor(count / size);
    if (t < 2) throw new TeamsError(`Para times de ${size}, são precisos pelo menos ${size * 2} jogadores (há ${count}).`);
    if (t > MAX_TEAMS) throw new TeamsError(`Isso daria ${t} times; o máximo é ${MAX_TEAMS}. Aumente os jogadores por time.`);
    if (reserves) return { teams: t, sizes: new Array(t).fill(size), reserves: count - size * t };
    return { teams: t, sizes: balancedSizes(count, t), reserves: 0 };
  }
  t = toInt(teams);
  if (!(t >= 2 && t <= MAX_TEAMS)) throw new TeamsError(`O número de times deve ficar entre 2 e ${MAX_TEAMS}.`);
  if (count < t) throw new TeamsError(`São ${count} jogadores para ${t} times: falta gente para ter pelo menos um em cada.`);
  if (reserves) {
    const size = Math.floor(count / t);
    return { teams: t, sizes: new Array(t).fill(size), reserves: count - size * t };
  }
  return { teams: t, sizes: balancedSizes(count, t), reserves: 0 };
}

/** "2 times de 6", "3 times: 2 de 7 e 1 de 6", "+ 1 reserva". */
export function describePlan(plan) {
  const counts = new Map();
  for (const s of plan.sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[0] - a[0]);
  let text = groups.length === 1
    ? `${plan.teams} times de ${groups[0][0]}`
    : `${plan.teams} times: ${groups.map(([size, n]) => `${n} de ${size}`).join(' e ')}`;
  if (plan.reserves) text += ` + ${plan.reserves} ${plan.reserves === 1 ? 'reserva' : 'reservas'}`;
  return text;
}

/* ---------- sorteio ---------- */

export function teamTotal(team) {
  return team.reduce((sum, p) => sum + levelOf(p), 0);
}

export function spreadOf(teams) {
  const totals = teams.map(teamTotal);
  return Math.max(...totals) - Math.min(...totals);
}

function score(totals) {
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  return [Math.max(...totals) - Math.min(...totals), totals.reduce((acc, x) => acc + (x - mean) ** 2, 0)];
}

const EPS = 1e-9;
const isBetter = (a, b) => a[0] < b[0] - EPS || (Math.abs(a[0] - b[0]) <= EPS && a[1] < b[1] - EPS);

/**
 * Melhora local: troca jogadores entre times (goleiro só com goleiro) ou passa alguém do time
 * maior para o menor, sempre que isso reduz a diferença entre o time mais forte e o mais fraco.
 */
function improve(teams, randomInt, maxRounds = 2000) {
  const totals = teams.map(teamTotal);
  const pairs = [];
  for (let a = 0; a < teams.length; a += 1) for (let b = a + 1; b < teams.length; b += 1) pairs.push([a, b]);
  for (let round = 0; round < maxRounds; round += 1) {
    let improved = false;
    const current = score(totals);
    const tryChange = (a, b, delta) => {
      totals[a] -= delta;
      totals[b] += delta;
      if (isBetter(score(totals), current)) return true;
      totals[a] += delta;
      totals[b] -= delta;
      return false;
    };
    search: for (const [x, y] of shuffle(pairs, randomInt)) {
      const [a, b] = randomInt(2) ? [x, y] : [y, x];
      for (const i of shuffle(range(teams[a].length), randomInt)) {
        const pa = teams[a][i];
        for (const j of shuffle(range(teams[b].length), randomInt)) {
          const pb = teams[b][j];
          if (Boolean(pa.asKeeper) !== Boolean(pb.asKeeper)) continue;
          const delta = levelOf(pa) - levelOf(pb);
          if (delta !== 0 && tryChange(a, b, delta)) {
            teams[a][i] = pb;
            teams[b][j] = pa;
            improved = true;
            break search;
          }
        }
        if (!pa.asKeeper && teams[a].length === teams[b].length + 1 && tryChange(a, b, levelOf(pa))) {
          teams[a].splice(i, 1);
          teams[b].push(pa);
          improved = true;
          break search;
        }
      }
    }
    if (!improved) return;
  }
}

/**
 * Sorteia os times.
 * players: [{ id, name, level (1–5 ou null), keeper }]. Devolve { teams, reserves, plan },
 * com goleiros escalados marcados como asKeeper.
 */
export function drawTeams(players, options = {}, randomInt = cryptoRandomInt) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const plan = planTeams({ count: players.length, ...opts });
  const t = plan.teams;
  let pool = shuffle(players.map((p) => ({ ...p, asKeeper: false })), randomInt);

  // Goleiros primeiro: um por time enquanto houver; os que sobram jogam na linha.
  let keepers = [];
  if (opts.separateKeepers) {
    keepers = pool.filter((p) => p.keeper).slice(0, t);
    pool = pool.filter((p) => !keepers.includes(p));
    for (const k of keepers) k.asKeeper = true;
  }
  // Reservas sorteadas entre os jogadores de linha.
  const reserves = pool.slice(0, plan.reserves);
  pool = pool.slice(plan.reserves);

  const teams = range(t).map(() => []);
  const capacity = shuffle(plan.sizes, randomInt);
  const order = shuffle(range(t), randomInt);
  keepers.forEach((k, i) => teams[order[i]].push(k));

  const hasRoom = (i) => teams[i].length < capacity[i];
  if (!opts.balance) {
    let cursor = 0;
    for (const p of pool) {
      while (!hasRoom(order[cursor % t])) cursor += 1;
      teams[order[cursor % t]].push(p);
      cursor += 1;
    }
  } else {
    // Ordena por nível (empates na ordem embaralhada) e escolhe em "cobrinha":
    // quem está mais fraco depois dos goleiros escolhe primeiro.
    pool.sort((a, b) => levelOf(b) - levelOf(a));
    const snakeOrder = [...order].sort((a, b) => teamTotal(teams[a]) - teamTotal(teams[b]));
    const sequence = [...snakeOrder, ...[...snakeOrder].reverse()];
    let cursor = 0;
    for (const p of pool) {
      while (!hasRoom(sequence[cursor % sequence.length])) cursor += 1;
      teams[sequence[cursor % sequence.length]].push(p);
      cursor += 1;
    }
    improve(teams, randomInt);
  }

  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  const sortTeam = (team) => team.sort((a, b) => Number(b.asKeeper) - Number(a.asKeeper) || collator.compare(a.name, b.name));
  return { teams: teams.map(sortTeam), reserves: sortTeam(reserves), plan };
}

/* ---------- texto para o WhatsApp ---------- */

export function stars(level) {
  return '★'.repeat(level ?? 0);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: Number.isInteger(value) ? 0 : 1 }).format(value);
}

export function formatTeamsText(result, names = [], { showLevels = false } = {}) {
  const line = (p) => {
    const mark = p.asKeeper ? '🧤 ' : '';
    const level = showLevels && p.level ? ` ${stars(p.level)}` : '';
    return `${mark}${p.name}${level}`;
  };
  const blocks = ['⚽ *Times sorteados*'];
  result.teams.forEach((team, i) => {
    const name = cleanName(names[i]) || TEAM_COLORS[i]?.name || `Time ${i + 1}`;
    const header = showLevels ? `*${name}* (nível ${teamTotal(team)})` : `*${name}*`;
    blocks.push([header, ...team.map(line)].join('\n'));
  });
  if (result.reserves.length) blocks.push(['*Reservas*', ...result.reserves.map(line)].join('\n'));
  return blocks.join('\n\n');
}
