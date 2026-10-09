import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEVEL, TeamsError, cryptoRandomInt, parseLevel, parsePlayerLine, parsePlayerList, planTeams, describePlan,
  drawTeams, teamTotal, spreadOf, formatTeamsText, formatNumber, stars, nameKey,
} from '../src/teams.js';

function seeded(seed) {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

const roster = (n, rnd, { keeperChance = 0, unknownChance = 0 } = {}) => Array.from({ length: n }, (_, i) => ({
  id: `j${i}`,
  name: `Jogador ${i + 1}`,
  level: rnd(100) < unknownChance ? null : 1 + rnd(5),
  keeper: rnd(100) < keeperChance,
}));

const ids = (result) => [...result.teams.flat(), ...result.reserves].map((p) => p.id);
const sizes = (result) => result.teams.map((t) => t.length);

test('linha colada: nome, nível, goleiro, numeração e emojis', () => {
  const cases = [
    ['Ana', { name: 'Ana', level: null, keeper: false }],
    ['Bruno - 4', { name: 'Bruno', level: 4, keeper: false }],
    ['Kiko – 2', { name: 'Kiko', level: 2, keeper: false }],
    ['Carlos (G)', { name: 'Carlos', level: null, keeper: true }],
    ['Diego goleiro - 5', { name: 'Diego', level: 5, keeper: true }],
    ['Goleiro: Edu', { name: 'Edu', level: null, keeper: true }],
    ['Goleira Quésia (3)', { name: 'Quésia', level: 3, keeper: true }],
    ['1. Fábio - 3', { name: 'Fábio', level: 3, keeper: false }],
    ['10- Nina', { name: 'Nina', level: null, keeper: false }],
    ['3º Saulo', { name: 'Saulo', level: null, keeper: false }],
    ['2) Gabi ⭐️⭐️⭐️⭐️', { name: 'Gabi', level: 4, keeper: false }],
    ['Lu 4★', { name: 'Lu', level: 4, keeper: false }],
    ['Mia - 4 estrelas', { name: 'Mia', level: 4, keeper: false }],
    ['João (4)', { name: 'João', level: 4, keeper: false }],
    ['Íris 🧤', { name: 'Íris', level: null, keeper: true }],
    ['[GK] Rafa', { name: 'Rafa', level: null, keeper: true }],
    ['Rui 4', { name: 'Rui 4', level: null, keeper: false }],
  ];
  for (const [line, expected] of cases) assert.deepEqual(parsePlayerLine(line), expected, line);
  assert.equal(parsePlayerLine('   '), null);
  assert.match(parsePlayerLine('Hugo - 7').warning, /nível 7 fora da escala/);
  assert.equal(parsePlayerLine('Hugo - 7').level, null);
  assert.match(parsePlayerLine('Paulo ★★★★★★').warning, /6 estrelas/);
});

test('lista colada: ignora vazias, junta repetidos e avisa problemas', () => {
  const { players, warnings } = parsePlayerList('Ana - 3\n\nBruno (G)\nana\nJOSÉ\nJose - 2\n(G)\nCaio - 9');
  assert.deepEqual(players.map((p) => p.name), ['Ana', 'Bruno', 'JOSÉ', 'Caio']);
  assert.equal(players[1].keeper, true);
  assert.equal(players[3].level, null);
  assert.equal(warnings.length, 4);
  assert.match(warnings[0], /Linha 4: ana apareceu de novo/);
  assert.match(warnings.join(' '), /Linha 7: linha sem nome/);
  assert.match(warnings.join(' '), /Linha 8 \(Caio\): nível 9/);
  assert.equal(nameKey(' José  da Silva '), 'jose da silva');
});

test('parseLevel aceita só inteiros de 1 a 5', () => {
  assert.equal(parseLevel('4'), 4);
  assert.equal(parseLevel(''), null);
  assert.equal(parseLevel('0'), null);
  assert.equal(parseLevel('6'), null);
  assert.equal(parseLevel('2.5'), null);
});

test('plano por número de times: todo mundo joga ou sobra reserva', () => {
  assert.deepEqual(planTeams({ count: 14, mode: 'teams', teams: 2 }), { teams: 2, sizes: [7, 7], reserves: 0 });
  assert.deepEqual(planTeams({ count: 13, mode: 'teams', teams: 2 }), { teams: 2, sizes: [7, 6], reserves: 0 });
  assert.deepEqual(planTeams({ count: 13, mode: 'teams', teams: 2, reserves: true }), { teams: 2, sizes: [6, 6], reserves: 1 });
  assert.deepEqual(planTeams({ count: 11, mode: 'teams', teams: '3' }), { teams: 3, sizes: [4, 4, 3], reserves: 0 });
});

test('plano por jogadores por time', () => {
  assert.deepEqual(planTeams({ count: 20, mode: 'size', perTeam: 6, reserves: true }), { teams: 3, sizes: [6, 6, 6], reserves: 2 });
  assert.deepEqual(planTeams({ count: 20, mode: 'size', perTeam: 6 }), { teams: 3, sizes: [7, 7, 6], reserves: 0 });
  assert.deepEqual(planTeams({ count: 10, mode: 'size', perTeam: 5 }), { teams: 2, sizes: [5, 5], reserves: 0 });
});

test('plano: erros amigáveis', () => {
  assert.throws(() => planTeams({ count: 1, mode: 'teams', teams: 2 }), /pelo menos 2 jogadores/);
  assert.throws(() => planTeams({ count: 10, mode: 'teams', teams: 1 }), /entre 2 e 10/);
  assert.throws(() => planTeams({ count: 30, mode: 'teams', teams: 11 }), /entre 2 e 10/);
  assert.throws(() => planTeams({ count: 3, mode: 'teams', teams: 4 }), /falta gente/);
  assert.throws(() => planTeams({ count: 9, mode: 'size', perTeam: 5 }), /pelo menos 10 jogadores \(há 9\)/);
  assert.throws(() => planTeams({ count: 30, mode: 'size', perTeam: 2 }), /15 times/);
  assert.throws(() => planTeams({ count: 10, mode: 'size', perTeam: 'x' }), TeamsError);
});

test('descrição do plano', () => {
  assert.equal(describePlan({ teams: 2, sizes: [6, 6], reserves: 0 }), '2 times de 6');
  assert.equal(describePlan({ teams: 3, sizes: [7, 7, 6], reserves: 0 }), '3 times: 2 de 7 e 1 de 6');
  assert.equal(describePlan({ teams: 2, sizes: [6, 6], reserves: 1 }), '2 times de 6 + 1 reserva');
  assert.equal(describePlan({ teams: 3, sizes: [6, 6, 6], reserves: 2 }), '3 times de 6 + 2 reservas');
});

test('tamanhos: diferença máxima de 1, ninguém repetido nem esquecido', () => {
  const rnd = seeded(1);
  for (let run = 0; run < 400; run += 1) {
    const n = 4 + rnd(40);
    const players = roster(n, rnd, { keeperChance: 15, unknownChance: 20 });
    const teams = 2 + rnd(Math.min(5, Math.floor(n / 2)) - 1);
    const options = { teams, balance: rnd(2) === 1, separateKeepers: rnd(2) === 1, reserves: rnd(2) === 1 };
    const result = drawTeams(players, options, rnd);
    const s = sizes(result);
    assert.equal(s.length, teams);
    assert.ok(Math.max(...s) - Math.min(...s) <= 1, `tamanhos ${s}`);
    assert.deepEqual([...ids(result)].sort(), players.map((p) => p.id).sort());
    if (options.reserves) {
      assert.equal(result.reserves.length, n % teams);
      assert.ok(s.every((x) => x === Math.floor(n / teams)));
    } else {
      assert.equal(result.reserves.length, 0);
    }
  }
});

test('reservas no modo jogadores por time', () => {
  const rnd = seeded(2);
  const result = drawTeams(roster(20, rnd), { mode: 'size', perTeam: 6, reserves: true }, rnd);
  assert.deepEqual(sizes(result), [6, 6, 6]);
  assert.equal(result.reserves.length, 2);
});

test('goleiros: um por time quando dá', () => {
  const rnd = seeded(3);
  for (let run = 0; run < 200; run += 1) {
    const players = roster(16, rnd);
    const keeperCount = rnd(6);
    for (let i = 0; i < keeperCount; i += 1) players[i].keeper = true;
    const teams = 2 + rnd(3);
    const result = drawTeams(players, { teams, separateKeepers: true, reserves: rnd(2) === 1 }, rnd);
    const perTeam = result.teams.map((t) => t.filter((p) => p.asKeeper).length);
    assert.ok(perTeam.every((k) => k <= 1), `goleiros por time ${perTeam}`);
    assert.equal(perTeam.reduce((a, b) => a + b, 0), Math.min(keeperCount, teams));
    assert.ok(result.reserves.every((p) => !p.asKeeper));
    for (const team of result.teams) {
      const k = team.findIndex((p) => p.asKeeper);
      assert.ok(k <= 0, 'goleiro aparece primeiro na lista do time');
    }
  }
});

test('goleiros: sem a opção, ninguém é escalado como goleiro', () => {
  const rnd = seeded(4);
  const players = roster(12, rnd, { keeperChance: 50 });
  const result = drawTeams(players, { teams: 2, separateKeepers: false }, rnd);
  assert.ok(result.teams.flat().every((p) => !p.asKeeper));
});

test('equilíbrio: diferença entre o time mais forte e o mais fraco fica até o nível máximo', () => {
  const rnd = seeded(5);
  let balancedSum = 0;
  let randomSum = 0;
  for (let run = 0; run < 500; run += 1) {
    const n = 8 + rnd(33);
    const players = roster(n, rnd, { keeperChance: 12, unknownChance: 15 });
    const teams = 2 + rnd(4);
    const separateKeepers = rnd(2) === 1;
    const reserves = rnd(2) === 1;
    const balanced = drawTeams(players, { teams, separateKeepers, reserves }, rnd);
    assert.ok(spreadOf(balanced.teams) <= MAX_LEVEL, `diferença ${spreadOf(balanced.teams)}`);
    balancedSum += spreadOf(balanced.teams);
    randomSum += spreadOf(drawTeams(players, { teams, separateKeepers, reserves, balance: false }, rnd).teams);
  }
  assert.ok(balancedSum * 4 < randomSum, `equilibrado ${balancedSum} x aleatório ${randomSum}`);
});

test('equilíbrio: craques não ficam todos no mesmo time', () => {
  const players = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, name: `Craque ${i}`, level: 5, keeper: false })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, name: `Ruim ${i}`, level: 1, keeper: false })),
  ];
  for (let seed = 0; seed < 50; seed += 1) {
    const result = drawTeams(players, { teams: 2 }, seeded(seed));
    assert.deepEqual(result.teams.map(teamTotal), [12, 12]);
  }
});

test('determinismo com gerador injetado e variedade entre sementes', () => {
  const players = roster(14, seeded(99), { keeperChance: 20 });
  const a = drawTeams(players, { teams: 2 }, seeded(7));
  const b = drawTeams(players, { teams: 2 }, seeded(7));
  assert.deepEqual(a, b);
  const seen = new Set();
  for (let seed = 0; seed < 30; seed += 1) seen.add(JSON.stringify(drawTeams(players, { teams: 2 }, seeded(seed)).teams.map((t) => t.map((p) => p.id))));
  assert.ok(seen.size > 10, `só ${seen.size} resultados diferentes`);
});

test('sorteio com crypto.getRandomValues funciona', () => {
  const result = drawTeams(roster(10, seeded(1)), { teams: 2 });
  assert.deepEqual(sizes(result), [5, 5]);
  for (let i = 0; i < 500; i += 1) {
    const v = cryptoRandomInt(3);
    assert.ok(v >= 0 && v < 3);
  }
});

test('texto para o WhatsApp, com e sem níveis', () => {
  const result = {
    teams: [
      [{ name: 'Pedro', level: 4, asKeeper: true }, { name: 'Ana', level: 5 }],
      [{ name: 'Bia', level: 3 }, { name: 'Caio', level: null }],
    ],
    reserves: [{ name: 'Zé', level: 2 }],
  };
  assert.equal(formatTeamsText(result, ['Coletes', '']),
    '⚽ *Times sorteados*\n\n*Coletes*\n🧤 Pedro\nAna\n\n*Vermelho*\nBia\nCaio\n\n*Reservas*\nZé');
  const withLevels = formatTeamsText(result, [], { showLevels: true });
  assert.match(withLevels, /\*Azul\* \(nível 9\)\n🧤 Pedro ★★★★\nAna ★★★★★/);
  assert.match(withLevels, /\*Vermelho\* \(nível 6\)\nBia ★★★\nCaio\n/);
});

test('formatação de números e estrelas', () => {
  assert.equal(formatNumber(3.5), '3,5');
  assert.equal(formatNumber(4), '4');
  assert.equal(formatNumber(10 / 3), '3,3');
  assert.equal(stars(3), '★★★');
  assert.equal(stars(null), '');
});

test('erros do sorteio chegam como TeamsError', () => {
  assert.throws(() => drawTeams([{ id: 1, name: 'Só', level: 3 }], { teams: 2 }), TeamsError);
  assert.throws(() => drawTeams(roster(5, seeded(1)), { mode: 'size', perTeam: 3 }), /pelo menos 6 jogadores/);
});
