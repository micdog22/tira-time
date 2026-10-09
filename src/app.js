import {
  DEFAULT_OPTIONS, MAX_PLAYERS, MAX_NAME_LENGTH, TEAM_COLORS, TeamsError, cleanName, nameKey, parseLevel,
  parsePlayerList, planTeams, describePlan, drawTeams, teamTotal, spreadOf, formatTeamsText, formatNumber, stars,
} from './teams.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'tira-time:v1';
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.includes('-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function showMessage(node, message) {
  node.textContent = message ?? '';
  node.hidden = !message;
}

function legacyCopy(text) {
  const area = el('textarea', { value: text, readOnly: true });
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      // Alguns navegadores deixam a promessa pendente quando não há permissão.
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('tempo esgotado')), 1500));
      await Promise.race([navigator.clipboard.writeText(text), timeout]);
      return true;
    } catch {
      // tenta o método antigo abaixo
    }
  }
  return legacyCopy(text);
}

/* ---------- estado ---------- */
function defaultState() {
  return { players: [], settings: { ...DEFAULT_OPTIONS, showLevels: false }, teamNames: [], result: null };
}

function loadState() {
  const base = defaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return base;
    const players = (Array.isArray(saved.players) ? saved.players : [])
      .filter((p) => p && typeof p.id === 'string' && cleanName(p.name))
      .slice(0, MAX_PLAYERS)
      .map((p) => ({ id: p.id, name: cleanName(p.name), level: parseLevel(p.level), keeper: Boolean(p.keeper), present: p.present !== false }));
    const settings = { ...base.settings };
    for (const key of Object.keys(settings)) {
      const value = saved.settings?.[key];
      const numeric = key === 'teams' || key === 'perTeam';
      if (numeric ? /^\d{1,3}$/.test(String(value ?? '')) : typeof value === typeof settings[key]) settings[key] = value;
    }
    if (!['teams', 'size'].includes(settings.mode)) settings.mode = 'teams';
    const teamNames = Array.isArray(saved.teamNames) ? saved.teamNames.map((n) => (typeof n === 'string' ? n : '')) : [];
    const result = saved.result && Array.isArray(saved.result.teams) && Array.isArray(saved.result.reserves) ? saved.result : null;
    return { players, settings, teamNames, result };
  } catch {
    return base;
  }
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sem armazenamento disponível: segue sem salvar
  }
}

const presentPlayers = () => state.players.filter((p) => p.present);

/* ---------- elenco ---------- */
function upsertPlayer({ name, level = null, keeper = false }, { update = false } = {}) {
  const clean = cleanName(name);
  if (!clean) return { error: 'Digite o nome do jogador.' };
  if (clean.length > MAX_NAME_LENGTH) return { error: `Use no máximo ${MAX_NAME_LENGTH} caracteres no nome.` };
  const existing = state.players.find((p) => nameKey(p.name) === nameKey(clean));
  if (existing) {
    if (!update) return { error: `${existing.name} já está no elenco.` };
    if (level !== null) existing.level = level;
    if (keeper) existing.keeper = true;
    existing.present = true;
    return { updated: existing };
  }
  if (state.players.length >= MAX_PLAYERS) return { error: `O elenco pode ter até ${MAX_PLAYERS} jogadores.` };
  const player = { id: uid(), name: clean, level, keeper, present: true };
  state.players.push(player);
  return { added: player };
}

function levelSelect(player) {
  const select = el('select', { class: 'player-level', 'aria-label': `Nível de ${player.name}` },
    el('option', { value: '', text: 'Sem nível' }),
    ...[1, 2, 3, 4, 5].map((n) => el('option', { value: String(n), text: `${n} ★` })));
  select.value = player.level ? String(player.level) : '';
  select.addEventListener('change', () => {
    player.level = parseLevel(select.value);
    save();
    renderPlan();
  });
  return select;
}

function renderRoster() {
  const sorted = [...state.players].sort((a, b) => collator.compare(a.name, b.name));
  $('elenco').replaceChildren(...sorted.map((player) => {
    const present = el('input', { type: 'checkbox', class: 'present', checked: player.present, 'aria-label': `${player.name} joga hoje` });
    const keeper = el('input', { type: 'checkbox', checked: player.keeper, 'aria-label': `${player.name} é goleiro` });
    const remove = el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remover ${player.name}`, text: '×' });
    const row = el('li', { class: player.present ? '' : 'absent' },
      present,
      el('span', { class: 'player-name', text: player.name }),
      levelSelect(player),
      el('label', { class: 'check gk-toggle' }, keeper, el('span', { 'aria-hidden': 'true', text: 'Goleiro' })),
      remove);
    present.addEventListener('change', () => {
      player.present = present.checked;
      row.classList.toggle('absent', !player.present);
      save();
      renderCounts();
      renderPlan();
    });
    keeper.addEventListener('change', () => {
      player.keeper = keeper.checked;
      save();
    });
    remove.addEventListener('click', () => {
      state.players = state.players.filter((p) => p.id !== player.id);
      save();
      renderRoster();
      $('jogador-nome').focus();
    });
    return row;
  }));
  renderCounts();
  renderPlan();
}

function renderCounts() {
  const total = state.players.length;
  const present = presentPlayers().length;
  const keepers = presentPlayers().filter((p) => p.keeper).length;
  $('presentes').textContent = total === 0
    ? 'Nenhum jogador ainda.'
    : `${present} de ${total} ${total === 1 ? 'jogador' : 'jogadores'} jogam hoje${keepers ? ` (${keepers} ${keepers === 1 ? 'goleiro' : 'goleiros'})` : ''}.`;
}

function setupRoster() {
  $('form-jogador').addEventListener('submit', (event) => {
    event.preventDefault();
    const nameInput = $('jogador-nome');
    const outcome = upsertPlayer({ name: nameInput.value, level: parseLevel($('jogador-nivel').value), keeper: $('jogador-goleiro').checked });
    showMessage($('jogador-erro'), outcome.error);
    nameInput.setAttribute('aria-invalid', String(Boolean(outcome.error)));
    if (outcome.error) return;
    nameInput.value = '';
    $('jogador-goleiro').checked = false;
    save();
    renderRoster();
    nameInput.focus();
  });

  $('lista-adicionar').addEventListener('click', () => {
    const { players, warnings } = parsePlayerList($('lista-colada').value);
    let added = 0;
    let updated = 0;
    for (const p of players) {
      const outcome = upsertPlayer(p, { update: true });
      if (outcome.added) added += 1;
      else if (outcome.updated) updated += 1;
      else warnings.push(`${p.name}: ${outcome.error}`);
    }
    const status = $('lista-status');
    const summary = players.length
      ? `${added} ${added === 1 ? 'jogador adicionado' : 'jogadores adicionados'} e ${updated} ${updated === 1 ? 'atualizado' : 'atualizados'}.`
      : 'Nenhum nome encontrado na lista.';
    status.replaceChildren(el('p', { text: summary }), warnings.length ? el('ul', {}, ...warnings.map((w) => el('li', { text: w }))) : null);
    if (added || updated) {
      $('lista-colada').value = '';
      save();
      renderRoster();
    }
  });

  const setAll = (present) => {
    for (const p of state.players) p.present = present;
    save();
    renderRoster();
  };
  $('marcar-todos').addEventListener('click', () => setAll(true));
  $('desmarcar-todos').addEventListener('click', () => setAll(false));
}

/* ---------- configurações ---------- */
function readSettings() {
  const s = state.settings;
  s.mode = $('modo-tamanho').checked ? 'size' : 'teams';
  s.teams = $('qtd-times').value;
  s.perTeam = $('por-time').value;
  s.balance = $('opt-equilibrar').checked;
  s.separateKeepers = $('opt-goleiros').checked;
  s.reserves = $('opt-reservas').checked;
  s.showLevels = $('copiar-niveis').checked;
}

function writeSettings() {
  const s = state.settings;
  $('modo-tamanho').checked = s.mode === 'size';
  $('modo-times').checked = s.mode !== 'size';
  $('qtd-times').value = String(s.teams);
  $('por-time').value = String(s.perTeam);
  $('opt-equilibrar').checked = s.balance;
  $('opt-goleiros').checked = s.separateKeepers;
  $('opt-reservas').checked = s.reserves;
  $('copiar-niveis').checked = s.showLevels;
}

function renderPlan() {
  const s = state.settings;
  $('campo-times').hidden = s.mode === 'size';
  $('campo-tamanho').hidden = s.mode !== 'size';
  const plan = $('plano');
  const count = presentPlayers().length;
  try {
    const p = planTeams({ count, ...s });
    plan.textContent = `${count} ${count === 1 ? 'jogador' : 'jogadores'} → ${describePlan(p)}`;
    plan.classList.remove('bad');
  } catch (error) {
    plan.textContent = error instanceof TeamsError ? error.message : 'Confira as configurações.';
    plan.classList.add('bad');
  }
}

function setupSettings() {
  writeSettings();
  const inputs = ['modo-times', 'modo-tamanho', 'qtd-times', 'por-time', 'opt-equilibrar', 'opt-goleiros', 'opt-reservas'];
  for (const id of inputs) {
    $(id).addEventListener('input', () => {
      readSettings();
      save();
      renderPlan();
    });
    $(id).addEventListener('change', () => {
      readSettings();
      save();
      renderPlan();
    });
  }
  $('copiar-niveis').addEventListener('change', () => {
    readSettings();
    save();
  });
}

/* ---------- sorteio e resultado ---------- */
function snapshot(result) {
  const pick = (p) => ({ id: p.id, name: p.name, level: p.level, keeper: p.keeper, asKeeper: p.asKeeper });
  return { teams: result.teams.map((t) => t.map(pick)), reserves: result.reserves.map(pick), at: new Date().toISOString() };
}

function runDraw() {
  readSettings();
  const errorBox = $('sorteio-erro');
  showMessage(errorBox, '');
  let result;
  try {
    result = drawTeams(presentPlayers(), state.settings);
  } catch (error) {
    showMessage(errorBox, error instanceof TeamsError ? error.message : `Algo deu errado: ${error.message}`);
    return false;
  }
  state.result = snapshot(result);
  save();
  renderResult();
  return true;
}

function teamName(i) {
  return cleanName(state.teamNames[i]) || TEAM_COLORS[i]?.name || `Time ${i + 1}`;
}

function playerItem(p) {
  return el('li', {},
    p.asKeeper ? el('span', { class: 'gk', title: 'Goleiro', text: '🧤' }) : null,
    p.asKeeper ? el('span', { class: 'sr-only', text: 'Goleiro: ' }) : null,
    el('span', { text: p.name }),
    p.level ? el('span', { class: 'stars', 'aria-label': `nível ${p.level}`, text: stars(p.level) }) : null);
}

function renderResult() {
  const result = state.result;
  const section = $('resultado');
  section.hidden = !result;
  if (!result) return;
  const unknown = [...result.teams.flat()].some((p) => !p.level);
  $('times').replaceChildren(...result.teams.map((team, i) => {
    const color = TEAM_COLORS[i]?.color ?? '#6b7280';
    const nameInput = el('input', { class: 'team-name', value: teamName(i), maxLength: 30, 'aria-label': `Nome do time ${i + 1}` });
    nameInput.addEventListener('input', () => {
      state.teamNames[i] = nameInput.value;
      save();
    });
    const total = teamTotal(team);
    const card = el('article', { class: 'team' },
      el('div', { class: 'team-head' }, el('span', { class: 'swatch', 'aria-hidden': 'true' }), nameInput),
      el('ul', { class: 'team-players' }, ...team.map(playerItem)),
      el('p', { class: 'team-stats', text: `${team.length} ${team.length === 1 ? 'jogador' : 'jogadores'} · nível total ${total} · média ${formatNumber(total / team.length)}` }));
    card.style.setProperty('--team-color', color);
    return card;
  }));
  $('reservas').hidden = result.reserves.length === 0;
  $('reservas-lista').replaceChildren(...result.reserves.map(playerItem));
  const spread = spreadOf(result.teams);
  const parts = [`Diferença entre o time mais forte e o mais fraco: ${spread} ${spread === 1 ? 'ponto' : 'pontos'}.`];
  if (unknown) parts.push('Quem está sem nível conta como 3.');
  $('resultado-resumo').textContent = parts.join(' ');
  $('copiar-status').textContent = '';
  $('copiar-manual').hidden = true;
}

function setupResult() {
  const go = () => {
    if (!runDraw()) return;
    const section = $('resultado');
    section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    $('resultado-titulo').focus({ preventScroll: true });
  };
  $('sortear').addEventListener('click', go);
  $('sortear-de-novo').addEventListener('click', go);
  $('copiar').addEventListener('click', async () => {
    readSettings();
    const result = state.result;
    if (!result) return;
    const names = result.teams.map((_, i) => teamName(i));
    const text = formatTeamsText(result, names, { showLevels: state.settings.showLevels });
    const ok = await copyText(text);
    const status = $('copiar-status');
    status.classList.toggle('bad', !ok);
    status.textContent = ok ? 'Times copiados! É só colar no grupo.' : 'Não deu para copiar automaticamente. O texto está no campo abaixo.';
    $('copiar-manual').hidden = ok;
    if (!ok) {
      const area = $('copiar-texto');
      area.value = text;
      area.focus();
      area.select();
    }
  });
}

setupRoster();
setupSettings();
setupResult();
renderRoster();
renderResult();
