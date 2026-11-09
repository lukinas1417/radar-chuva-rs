// Normalização das fontes. A regra que mais importa: "sem dado" nunca pode virar "zero" nem "normal".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexarMunicipios } from '../src/geo.js';
import { acumuladosEstimativa, cadastroAna, cadastroAnaChuva, capitalizar, estimativaPrecisaRenovar, normalizarAna, normalizarAnaChuva, normalizarChuvaCemaden, normalizarDefesaCivil, normalizarEstimativa, paraIsoAna, paraIsoCemaden, paraIsoDefesaCivil, previsaoHoraria, serieEstimativa } from '../src/normalizar.js';

// ---------- CEMADEN ----------

test('data do CEMADEN vira ISO com o fuso de Brasília', () => {
  assert.equal(paraIsoCemaden('21/10/26 19:10'), '2026-10-21T19:10:00-03:00');
  assert.equal(paraIsoCemaden('1/2/26 9:05'), '2026-02-01T09:05:00-03:00');
});

test('data inválida ou ausente vira null, não uma data inventada', () => {
  assert.equal(paraIsoCemaden(null), null);
  assert.equal(paraIsoCemaden(''), null);
  assert.equal(paraIsoCemaden('ontem'), null);
});

const AGORA_CEMADEN = Date.parse('2026-10-21T19:50:00-03:00');
const estacaoCemaden = (extra) => ({
  idestacao: 1,
  codibge: 4305108,
  cidade: 'CAXIAS DO SUL',
  nomeestacao: 'Centro',
  ultimovalor: 0,
  datahoraUltimovalor: '21/10/26 19:40',
  acc1hr: '-',
  acc3hr: '-',
  acc6hr: '-',
  acc12hr: '-',
  acc24hr: '-',
  acc48hr: '-',
  acc72hr: '-',
  acc96hr: '-',
  tipoestacao: 1,
  ...extra,
});
const normalizarUma = (extra) => normalizarChuvaCemaden([estacaoCemaden(extra)], AGORA_CEMADEN)[0];

test('"-" em estação ativa significa 0 mm: o CEMADEN só preenche o acumulado quando choveu', () => {
  const e = normalizarUma({});
  assert.equal(e.ativa, true);
  assert.equal(e.acumuladoMm['24h'], 0);
  assert.equal(e.acumuladoMm['96h'], 0);
});

test('"-" em estação SEM leitura recente é "sem dado" (null), nunca 0', () => {
  const e = normalizarUma({ datahoraUltimovalor: '21/10/26 15:00' });
  assert.equal(e.ativa, false);
  assert.equal(e.acumuladoMm['24h'], null);
  assert.equal(e.acumuladoMm['96h'], null);
});

test('valor numérico da fonte é preservado como veio', () => {
  const e = normalizarUma({ acc1hr: 1.2, acc24hr: 14.8 });
  assert.equal(e.acumuladoMm['1h'], 1.2);
  assert.equal(e.acumuladoMm['24h'], 14.8);
});

test('o limite de 3 horas é inclusivo: exatamente 3 h ainda é ativa, 3 h e 1 min não', () => {
  assert.equal(normalizarUma({ datahoraUltimovalor: '21/10/26 16:50' }).ativa, true);
  assert.equal(normalizarUma({ datahoraUltimovalor: '21/10/26 16:49' }).ativa, false);
});

test('estação sem data de leitura nunca é considerada ativa', () => {
  const e = normalizarUma({ datahoraUltimovalor: null });
  assert.equal(e.ativa, false);
  assert.equal(e.ultimaLeitura, null);
  assert.equal(e.acumuladoMm['24h'], null);
});

// ---------- Defesa Civil RS ----------

const malha = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { codIbge: 1, nome: 'Alfa' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } },
  ],
};
const indice = indexarMunicipios(malha);
const AGORA_DC = Date.parse('2026-10-22T12:00:00-03:00');

const v = (value) => ({ value });
function estacaoDC({ codigo = 'DCRS-1', lon = 0.5, lat = 0.5, ts = '2026-10-22T11:55:00.000', show = 'true', nivel = 1.5, ativo = true, status = 0, manut = false, chuva = {}, chuvaValida = true } = {}) {
  const ac = { h001: v(0), h006: v(0), h024: v(0), h048: v(0), h168: v(0), ...chuva };
  return {
    codigo,
    name: { general: codigo },
    show,
    timestamp: ts,
    position: { bacia: 'Teste', regiao: 'Teste', latitude: lat, longitude: lon },
    data: {
      rio: {
        rio_nivel: nivel === null ? null : v(nivel),
        rio_nivel_tendencia: v(0),
        rio_alarmes: { inundacao: { ativo: v(ativo), status: v(status) } },
        homologacao: { relacao: { valido: v(true) } },
      },
      chuva: { acumulado: ac, homologacao: { relacao: { valido: v(chuvaValida) } } },
    },
    resource: { estacao: { estado: { manutencao: v(manut) } } },
  };
}
const normalizarDC = (...estacoes) => normalizarDefesaCivil(estacoes, AGORA_DC, indice);

test('a data da Defesa Civil (sem fuso) vira ISO com o fuso de Brasília', () => {
  assert.equal(paraIsoDefesaCivil('2026-10-21T16:55:00.000'), '2026-10-21T16:55:00-03:00');
  assert.equal(paraIsoDefesaCivil(null), null);
});

test('o status da fonte (0 a 3) é repassado, sem o sistema inventar uma classificação', () => {
  for (const status of [0, 1, 2, 3]) {
    assert.equal(normalizarDC(estacaoDC({ status })).estacoes[0].situacao, status);
  }
});

test('estação sem limiar cadastrado (ativo: false) tem situação null, não "normal"', () => {
  const { estacoes } = normalizarDC(estacaoDC({ ativo: false, status: 0 }));
  assert.equal(estacoes[0].situacao, null);
});

test('estação marcada para não exibir fica de fora das duas listas', () => {
  const r = normalizarDC(estacaoDC({ show: 'false' }));
  assert.equal(r.estacoes.length, 0);
  assert.equal(r.pluviometros.length, 0);
});

test('estação sem sensor de rio não entra em "rios", mas o pluviômetro dela entra', () => {
  const r = normalizarDC(estacaoDC({ nivel: null }));
  assert.equal(r.estacoes.length, 0);
  assert.equal(r.pluviometros.length, 1);
});

test('pluviômetro com leitura recente e todas as janelas medidas é ativo', () => {
  assert.equal(normalizarDC(estacaoDC()).pluviometros[0].ativa, true);
});

test('o limite de 30 minutos é inclusivo: 30 min ainda é ativo, 31 min não', () => {
  assert.equal(normalizarDC(estacaoDC({ ts: '2026-10-22T11:30:00.000' })).pluviometros[0].ativa, true);
  assert.equal(normalizarDC(estacaoDC({ ts: '2026-10-22T11:29:00.000' })).pluviometros[0].ativa, false);
});

test('uma janela de chuva sem medida (null) basta para o pluviômetro não ser ativo', () => {
  const r = normalizarDC(estacaoDC({ chuva: { h024: v(null) } }));
  assert.equal(r.pluviometros[0].ativa, false);
});

test('estação em manutenção não é considerada ativa', () => {
  assert.equal(normalizarDC(estacaoDC({ manut: true })).pluviometros[0].ativa, false);
  assert.equal(normalizarDC(estacaoDC({ manut: true })).estacoes[0].emManutencao, true);
});

test('chuva marcada como não homologada é descartada', () => {
  assert.equal(normalizarDC(estacaoDC({ chuvaValida: false })).pluviometros.length, 0);
});

test('estação fora da malha municipal fica com codIbge null (e não no município vizinho)', () => {
  assert.equal(normalizarDC(estacaoDC({ lon: 50, lat: 50 })).pluviometros[0].codIbge, null);
  assert.equal(normalizarDC(estacaoDC()).pluviometros[0].codIbge, 1);
});

// ---------- Open-Meteo (estimativa e previsão) ----------

const AGORA_EST = Date.parse('2026-10-22T14:40:00Z');
// 120 horas em ponto, de 20/10 00:00Z a 24/10 23:00Z (como a resposta da API: passado + previsão). Padrão: 1 mm/h.
function horario(valorDe = () => 1) {
  const inicio = Date.parse('2026-10-20T00:00:00Z') / 1000;
  const time = Array.from({ length: 120 }, (_, i) => inicio + i * 3600);
  return { time, precipitation: time.map((t) => valorDe(t)) };
}
const aposAgora = (t) => t * 1000 > AGORA_EST;
const serie = (valorDe) => serieEstimativa(horario(valorDe), AGORA_EST);

test('acumulado soma só as horas já terminadas; a previsão que vem junto não entra', () => {
  const s = serie((t) => (aposAgora(t) ? 100 : 1));
  const r = acumuladosEstimativa(s, AGORA_EST);
  assert.deepEqual([r['1h'], r['6h'], r['24h']], [1, 6, 24]);
});

test('previsão soma as próximas horas cheias; o passado não entra', () => {
  const s = serie((t) => (aposAgora(t) ? 2 : 50));
  const r = acumuladosEstimativa(s, AGORA_EST);
  assert.equal(r['+6h'], 12);
  assert.equal(r['+24h'], 48);
});

test('a previsão é recalculada a partir do "agora" do navegador, não da hora da coleta', () => {
  const s = serie((t) => (t * 1000 <= AGORA_EST + 3 * 3600_000 ? 0 : 5)); // chove só depois de 3 h
  assert.equal(acumuladosEstimativa(s, AGORA_EST)['+6h'], 15); // coleta: 3 h secas + 3 h de 5 mm
  assert.equal(acumuladosEstimativa(s, AGORA_EST + 3 * 3600_000)['+6h'], 30); // 3 h depois: as 6 h seguintes chovem
});

test('janela com buraco (null) vira null, não uma soma parcial', () => {
  const buraco = Date.parse('2026-10-22T10:00:00Z');
  const s = serie((t) => (t * 1000 === buraco ? null : 1));
  const r = acumuladosEstimativa(s, AGORA_EST);
  assert.equal(r['1h'], 1);
  assert.equal(r['6h'], null);
  assert.equal(r['24h'], null);
});

test('previsão com buraco vira null', () => {
  const buraco = Date.parse('2026-10-22T20:00:00Z');
  const s = serie((t) => (t * 1000 === buraco ? null : 1));
  const r = acumuladosEstimativa(s, AGORA_EST);
  assert.equal(r['+6h'], null);
  assert.equal(r['6h'], 6);
});

test('poucas horas à frente não completam a janela de +24 h', () => {
  const h = horario();
  const curta = { time: h.time.slice(0, 73), precipitation: h.precipitation.slice(0, 73) }; // só 10 h à frente
  const r = acumuladosEstimativa(serieEstimativa(curta, AGORA_EST), AGORA_EST);
  assert.equal(r['+6h'], 6);
  assert.equal(r['+24h'], null);
});

test('arredonda a 0,1 mm', () => {
  assert.equal(acumuladosEstimativa(serie(() => 0.1), AGORA_EST)['6h'], 0.6);
});

test('previsaoHoraria devolve as próximas 24 horas, em ordem e depois do agora', () => {
  const horas = previsaoHoraria(serie(), AGORA_EST);
  assert.equal(horas.length, 24);
  assert.ok(horas.every((h) => h.t > AGORA_EST));
  assert.deepEqual(horas.map((h) => h.t), [...horas.map((h) => h.t)].sort((a, b) => a - b));
  assert.equal(horas[0].t, Date.parse('2026-10-22T15:00:00Z'));
});

test('a série guardada cobre o atraso permitido: 6 h depois ainda completa 24 h e +24 h', () => {
  const depois = acumuladosEstimativa(serie(), AGORA_EST + 6 * 3600_000);
  assert.equal(depois['24h'], 24);
  assert.equal(depois['+24h'], 24);
});

test('normalizarEstimativa descarta município sem resposta completa', () => {
  const ok = { hourly: horario() };
  const furado = { hourly: horario((t) => (t * 1000 > AGORA_EST - 3600_000 && t * 1000 <= AGORA_EST ? null : 1)) };
  const r = normalizarEstimativa([ok, furado, undefined], [10, 20, 30], AGORA_EST);
  assert.deepEqual(r.map((m) => m.codIbge), [10]);
});

test('a estimativa só é renovada depois de 3 h; data inválida força renovação', () => {
  const agora = Date.parse('2026-10-22T15:00:00Z');
  assert.equal(estimativaPrecisaRenovar('2026-10-22T13:00:00Z', agora), false);
  assert.equal(estimativaPrecisaRenovar('2026-10-22T11:30:00Z', agora), true);
  assert.equal(estimativaPrecisaRenovar(undefined, agora), true);
  assert.equal(estimativaPrecisaRenovar('lixo', agora), true);
});

// ---------- ANA (HidroWebService) ----------

test('data da ANA vira ISO com o fuso de Brasília; texto que não é data vira null', () => {
  assert.equal(paraIsoAna('2026-11-04 12:00:00.0'), '2026-11-04T12:00:00-03:00');
  assert.equal(paraIsoAna(null), null);
  assert.equal(paraIsoAna('ontem'), null);
});

test('nomes: a sigla da operadora e as rodovias ficam em caixa alta', () => {
  assert.equal(capitalizar('CSG ANTÔNIO PRADO - 1248', ['CSG']), 'CSG Antônio Prado - 1248');
  assert.equal(capitalizar('UHE CASTRO ALVES RS-122'), 'UHE Castro Alves RS-122');
  assert.equal(capitalizar('RIO DAS ANTAS'), 'Rio das Antas'); // sem sigla para preservar, nada muda
  assert.equal(capitalizar('CERAN PASSO', [null, undefined]), 'Ceran Passo');
});

test('nomes em caixa alta ficam legíveis, mantendo siglas e partículas', () => {
  assert.equal(capitalizar('UHE BARRA GRANDE PASSO DO HONORATO'), 'UHE Barra Grande Passo do Honorato');
  assert.equal(capitalizar('RIO DAS ANTAS'), 'Rio das Antas');
  assert.equal(capitalizar(null), '');
});

const invAna = (extra) => ({
  codigoestacao: 70120000,
  Estacao_Nome: 'UHE BARRA GRANDE FAXINAL PRETO',
  Rio_Nome: 'RIO PELOTAS',
  Bacia_Nome: 'RIO URUGUAI',
  Operadora_Sigla: 'BAESA',
  Latitude: '-28.5',
  Longitude: '-51.1',
  Tipo_Estacao: 'Fluviometrica',
  Tipo_Estacao_Telemetrica: 1,
  Operando: 1,
  ...extra,
});

test('cadastro: só rio telemétrico em operação, e sem as estações da Defesa Civil (já vêm da fonte dela)', () => {
  const cad = cadastroAna([
    invAna({}),
    invAna({ codigoestacao: 2, Operadora_Sigla: 'DCRS' }),
    invAna({ codigoestacao: 3, Tipo_Estacao: 'Pluviometrica' }),
    invAna({ codigoestacao: 4, Operando: 0 }),
    invAna({ codigoestacao: 5, Tipo_Estacao_Telemetrica: 0 }),
    invAna({ codigoestacao: 6, Latitude: null }),
    invAna({ codigoestacao: 7, Latitude: 'x' }),
  ]);
  assert.deepEqual(cad.map((c) => c.codigo), ['70120000']);
  assert.equal(cad[0].nome, 'UHE Barra Grande Faxinal Preto');
  assert.equal(cad[0].lat, -28.5);
});

const cadAna = cadastroAna([invAna({})]);
const linhaAna = (hora, cota, extra) => ({
  codigoestacao: '70120000',
  Data_Hora_Medicao: `2026-11-04 ${hora}:00:00.0`,
  Cota_Adotada: cota,
  Cota_Adotada_Status: '0',
  Vazao_Adotada: '77.03',
  Vazao_Adotada_Status: '0',
  ...extra,
});

test('ANA: cota em cm vira metros, e a última leitura é a mais recente, não a última da lista', () => {
  const [e] = normalizarAna(cadAna, [linhaAna('15', '150.00'), linhaAna('12', '118.00'), linhaAna('13', '127.00')]);
  assert.equal(e.codigo, 'ANA-70120000');
  assert.equal(e.nivelM, 1.5);
  assert.equal(e.ultimaLeitura, '2026-11-04T18:00:00.000Z'); // 15:00 em Brasília
  assert.equal(e.fonte, 'ANA');
  assert.equal(e.vazaoM3s, 77.03);
});

test('ANA: a variação diz em quantas horas foi medida; com menos de 3 h de histórico não há variação', () => {
  const [e] = normalizarAna(cadAna, [linhaAna('12', '118.00'), linhaAna('15', '150.00')]);
  assert.equal(e.variacaoM, 0.32);
  assert.equal(e.variacaoH, 3);
  const [curta] = normalizarAna(cadAna, [linhaAna('14', '118.00'), linhaAna('15', '150.00')]);
  assert.equal(curta.variacaoM, null);
  assert.equal(curta.variacaoH, null);
});

test('ANA: com série longa (48 h), a variação olha só as últimas 6 h', () => {
  const horas = ['00', '06', '12', '13', '14', '15'];
  const [e] = normalizarAna(cadAna, [linhaAna('00', '1000.00'), linhaAna('06', '500.00'), linhaAna('12', '118.00'), linhaAna('13', '127.00'), linhaAna('14', '140.00'), linhaAna('15', '150.00')]);
  assert.equal(horas.length, 6);
  assert.equal(e.variacaoM, 0.32); // 150 - 118, e não 150 - 1000
  assert.equal(e.variacaoH, 3);
});

test('ANA: sem limiar de alerta, a situação é null — nunca 0 (normalidade)', () => {
  const [e] = normalizarAna(cadAna, [linhaAna('15', '150.00')]);
  assert.equal(e.situacao, null);
});

test('ANA: leitura sem cota, com cota inválida ou com status que não é medição é descartada', () => {
  const linhas = [
    linhaAna('12', null),
    linhaAna('13', ''),
    linhaAna('14', 'abc'),
    linhaAna('15', '100.00', { Cota_Adotada_Status: '2' }), // estimado
    linhaAna('16', '100.00', { Cota_Adotada_Status: null }),
  ];
  assert.deepEqual(normalizarAna(cadAna, linhas), []);
});

test('ANA: estação sem nenhuma leitura válida fica de fora (não vira "sem alerta")', () => {
  assert.deepEqual(normalizarAna(cadAna, []), []);
  assert.deepEqual(normalizarAna(cadAna, [{ ...linhaAna('15', '100.00'), codigoestacao: '999' }]), []);
});

test('ANA: vazão com status que não é medição não é mostrada, mas a cota continua valendo', () => {
  const [e] = normalizarAna(cadAna, [linhaAna('15', '150.00', { Vazao_Adotada_Status: '3' })]);
  assert.equal(e.vazaoM3s, null);
  assert.equal(e.nivelM, 1.5);
});

// ---------- ANA: chuva ----------

const malhaAna = indexarMunicipios({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { codIbge: 4300001, nome: 'Teste' }, geometry: { type: 'Polygon', coordinates: [[[-52, -30], [-50, -30], [-50, -28], [-52, -28], [-52, -30]]] } }],
});
const pluvAna = (extra) => ({ Tipo_Estacao: 'Pluviometrica', codigoestacao: 2851061, Estacao_Nome: 'ITA', Operadora_Sigla: 'SGB-CPRM', Latitude: '-29', Longitude: '-51', Tipo_Estacao_Telemetrica: 1, Operando: 1, ...extra });

test('cadastro de chuva: só pluviômetro telemétrico em operação, sem CEMADEN nem Defesa Civil (já são fontes do mapa)', () => {
  const cad = cadastroAnaChuva([
    pluvAna({}),
    pluvAna({ codigoestacao: 2, Operadora_Sigla: 'CEMADEN' }),
    pluvAna({ codigoestacao: 3, Operadora_Sigla: 'DCRS' }),
    pluvAna({ codigoestacao: 4, Tipo_Estacao: 'Fluviometrica' }),
    pluvAna({ codigoestacao: 5, Operando: 0 }),
    pluvAna({ codigoestacao: 6, Longitude: null }),
  ]);
  assert.deepEqual(cad.map((c) => c.codigo), ['2851061']);
});

// Gera `n` leituras terminando em `fim` (hora de Brasília, "2026-11-04 17:00"), uma a cada `passoMin` minutos.
const serieChuva = (valores, passoMin = 60, fim = '2026-11-04T17:00:00-03:00') =>
  valores.map((mm, i) => {
    const t = new Date(Date.parse(fim) - (valores.length - 1 - i) * passoMin * 60_000);
    const local = new Date(t.getTime() - 3 * 3600_000).toISOString(); // relógio de Brasília
    return { codigoestacao: '2851061', Data_Hora_Medicao: `${local.slice(0, 10)} ${local.slice(11, 19)}.0`, Chuva_Adotada: mm === null ? null : String(mm), Chuva_Adotada_Status: mm === null ? null : '0' };
  });
const cadChuva = cadastroAnaChuva([pluvAna({})]);
const AGORA_ANA = Date.parse('2026-11-04T17:20:00-03:00');
const chuvaAna = (linhas, agora = AGORA_ANA) => normalizarAnaChuva(cadChuva, linhas, agora, malhaAna)[0];

test('ANA chuva: soma os intervalos de cada janela; estação horária com 24 leituras fecha 1 h, 6 h e 24 h', () => {
  const horas = Array.from({ length: 24 }, (_, i) => (i === 23 ? 5 : i === 22 ? 2.5 : i === 10 ? 1 : 0));
  const e = chuvaAna(serieChuva(horas));
  assert.deepEqual(e.acumuladoMm, { '1h': 5, '6h': 7.5, '24h': 8.5 });
  assert.equal(e.ativa, true);
  assert.equal(e.codigo, 'ANA-2851061');
  assert.equal(e.codIbge, 4300001);
});

test('ANA chuva: estação de 15 min soma quatro leituras por hora', () => {
  const quartos = Array.from({ length: 96 }, (_, i) => (i >= 92 ? 0.5 : 0));
  const e = chuvaAna(serieChuva(quartos, 15));
  assert.equal(e.acumuladoMm['1h'], 2);
  assert.equal(e.acumuladoMm['24h'], 2);
  assert.equal(e.ativa, true);
});

test('ANA chuva: intervalo faltando torna a janela null — soma parcial subestimaria a chuva, e ausência nunca vira 0', () => {
  const horas = Array.from({ length: 24 }, () => 1);
  const comBuraco = serieChuva(horas).filter((_, i) => i !== 12); // uma hora sumiu
  const e = chuvaAna(comBuraco);
  assert.equal(e.acumuladoMm['1h'], 1);
  assert.equal(e.acumuladoMm['6h'], 6);
  assert.equal(e.acumuladoMm['24h'], null);
  assert.equal(e.ativa, false); // sem todas as janelas medidas, não é estação ativa
});

test('ANA chuva: leitura sem valor dentro da janela invalida a janela, em vez de contar como 0 mm', () => {
  const horas = Array.from({ length: 24 }, () => 1);
  horas[20] = null;
  const e = chuvaAna(serieChuva(horas));
  assert.equal(e.acumuladoMm['1h'], 1);
  assert.equal(e.acumuladoMm['6h'], null);
  assert.equal(e.acumuladoMm['24h'], null);
});

test('ANA chuva: status que não é medição, valor negativo e texto inválido são tratados como sem valor', () => {
  const base = Array.from({ length: 24 }, () => 1);
  const linhas = serieChuva(base);
  linhas[23] = { ...linhas[23], Chuva_Adotada_Status: '2' }; // estimado
  assert.equal(chuvaAna(linhas).acumuladoMm['1h'], null);
  const negativo = serieChuva(base);
  negativo[23].Chuva_Adotada = '-3';
  assert.equal(chuvaAna(negativo).acumuladoMm['1h'], null);
  const lixo = serieChuva(base);
  lixo[23].Chuva_Adotada = 'abc';
  assert.equal(chuvaAna(lixo).acumuladoMm['1h'], null);
});

test('ANA chuva: chuva zero medida é 0, e é diferente de sem dado', () => {
  const e = chuvaAna(serieChuva(Array.from({ length: 24 }, () => 0)));
  assert.deepEqual(e.acumuladoMm, { '1h': 0, '6h': 0, '24h': 0 });
});

test('ANA chuva: última leitura com mais de 2 h da coleta deixa a estação inativa', () => {
  const horas = Array.from({ length: 24 }, () => 0);
  assert.equal(chuvaAna(serieChuva(horas), Date.parse('2026-11-04T19:30:00-03:00')).ativa, false);
  assert.equal(chuvaAna(serieChuva(horas), Date.parse('2026-11-04T18:50:00-03:00')).ativa, true);
});

test('ANA chuva: sem leituras suficientes, ou nenhuma com valor, a estação fica de fora', () => {
  assert.deepEqual(normalizarAnaChuva(cadChuva, [], AGORA_ANA, malhaAna), []);
  assert.deepEqual(normalizarAnaChuva(cadChuva, serieChuva([1, 2]), AGORA_ANA, malhaAna), []);
  assert.deepEqual(normalizarAnaChuva(cadChuva, serieChuva([null, null, null, null]), AGORA_ANA, malhaAna), []);
});

test('ANA chuva: estação fora da malha fica com codIbge null (o mapa a ignora)', () => {
  const fora = cadastroAnaChuva([pluvAna({ Longitude: '-40' })]);
  const [e] = normalizarAnaChuva(fora, serieChuva(Array.from({ length: 24 }, () => 0)), AGORA_ANA, malhaAna);
  assert.equal(e.codIbge, null);
});

test('ANA chuva: a estação leva as próprias coordenadas, para aparecer como ponto no mapa', () => {
  const e = chuvaAna(serieChuva(Array.from({ length: 24 }, () => 0)));
  assert.deepEqual([e.lat, e.lon], [-29, -51]);
});
