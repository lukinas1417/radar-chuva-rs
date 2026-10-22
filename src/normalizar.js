// Normaliza as respostas das fontes. Funções puras: não acessam rede nem o relógio global
// (recebem o "agora"), o que permite testá-las com dados fixos.
import { municipioDe } from './geo.js';

// CEMADEN: leitura de até 3 h é de estação ativa. Passou disso, a estação é "sem dado".
export const ATIVA_ATE_MS = 3 * 60 * 60 * 1000;
// Defesa Civil: a API manda `null` quando a estação não enviou a medida nos últimos 20 min.
export const LEITURA_RECENTE_MS = 30 * 60 * 1000;

// "21/10/26 19:10" (horário de Brasília) -> ISO 8601 com offset; null se não for uma data.
export function paraIsoCemaden(texto) {
  const m = texto?.match(/^(\d+)\/(\d+)\/(\d+) (\d+):(\d+)$/);
  if (!m) return null;
  const [, d, mo, a, h, mi] = m.map((v, i) => (i ? v.padStart(2, '0') : v));
  return `20${a}-${mo}-${d}T${h}:${mi}:00-03:00`;
}

// O CEMADEN só preenche o acumulado quando choveu na janela: "-" em estação ativa é 0 mm.
// Em estação sem leitura recente, "-" significa que não sabemos: null.
const numero = (v, ativa) => (typeof v === 'number' ? v : ativa ? 0 : null);

export function normalizarChuvaCemaden(bruto, agoraMs) {
  return bruto.map((e) => {
    const ultimaLeitura = paraIsoCemaden(e.datahoraUltimovalor);
    const ativa = ultimaLeitura !== null && agoraMs - Date.parse(ultimaLeitura) <= ATIVA_ATE_MS;
    return {
      id: e.idestacao,
      codIbge: e.codibge,
      municipio: e.cidade,
      nome: e.nomeestacao,
      ultimaLeitura,
      ativa,
      ultimoValorMm: numero(e.ultimovalor, ativa),
      acumuladoMm: {
        '1h': numero(e.acc1hr, ativa),
        '3h': numero(e.acc3hr, ativa),
        '6h': numero(e.acc6hr, ativa),
        '12h': numero(e.acc12hr, ativa),
        '24h': numero(e.acc24hr, ativa),
        '48h': numero(e.acc48hr, ativa),
        '72h': numero(e.acc72hr, ativa),
        '96h': numero(e.acc96hr, ativa),
      },
      tipo: e.tipoestacao,
    };
  });
}

// "2026-10-21T16:55:00.000" (horário de Brasília, sem offset) -> ISO com offset
export const paraIsoDefesaCivil = (t) => (t ? `${t.slice(0, 19)}-03:00` : null);
const valor = (campo) => campo?.value ?? null;

// Resposta da Defesa Civil RS -> estações de rio e pluviômetros.
// `indice` é a malha municipal indexada (geo.js); estação fora da malha fica com codIbge null.
export function normalizarDefesaCivil(bruto, agoraMs, indice) {
  const estacoes = bruto
    .filter((e) => e.show === 'true' && valor(e.data?.rio?.rio_nivel) !== null)
    .map((e) => ({
      codigo: e.codigo,
      nome: e.name.general,
      bacia: e.position.bacia,
      regiao: e.position.regiao,
      lat: e.position.latitude,
      lon: e.position.longitude,
      ultimaLeitura: paraIsoDefesaCivil(e.timestamp),
      nivelM: valor(e.data.rio.rio_nivel),
      variacaoM: valor(e.data.rio.rio_nivel_tendencia),
      // 0 normalidade, 1 atenção, 2 alerta, 3 inundação, null sem leitura/sem limiar cadastrado
      situacao: e.data.rio.rio_alarmes?.inundacao?.ativo?.value ? valor(e.data.rio.rio_alarmes.inundacao.status) : null,
      emManutencao: e.resource?.estacao?.estado?.manutencao?.value === true,
      sensorValido: e.data.rio.homologacao?.relacao?.valido?.value !== false,
      chuvaMm: {
        '1h': valor(e.data.chuva?.acumulado?.h001),
        '24h': valor(e.data.chuva?.acumulado?.h024),
        '7d': valor(e.data.chuva?.acumulado?.h168),
      },
    }));

  // Pluviômetros: todas as estações com chuva válida, inclusive as sem sensor de rio.
  const pluviometros = bruto
    .filter((e) => e.show === 'true' && e.data?.chuva?.homologacao?.relacao?.valido?.value !== false)
    .map((e) => {
      const ac = e.data?.chuva?.acumulado;
      const ultimaLeitura = paraIsoDefesaCivil(e.timestamp);
      const acumuladoMm = {
        '1h': valor(ac?.h001),
        '6h': valor(ac?.h006),
        '24h': valor(ac?.h024),
        '48h': valor(ac?.h048),
      };
      // Ativa só com leitura recente, fora de manutenção e com TODAS as janelas medidas.
      const ativa =
        Date.parse(ultimaLeitura) >= agoraMs - LEITURA_RECENTE_MS &&
        e.resource?.estacao?.estado?.manutencao?.value !== true &&
        Object.values(acumuladoMm).every((v) => v !== null);
      return {
        codigo: e.codigo,
        nome: e.name.general,
        codIbge: municipioDe(indice, e.position.longitude, e.position.latitude)?.codIbge ?? null,
        ultimaLeitura,
        ativa,
        acumuladoMm,
      };
    });

  return { estacoes, pluviometros };
}

// ---------- Open-Meteo (estimativa e previsão por modelo) ----------
// Formato do arquivo gravado. Mudou quando entrou a previsão: arquivo de outra versão não é usado.
export const VERSAO_ESTIMATIVA = 2;
// Passado: acumulado das últimas N horas. Futuro ("+N h"): previsão das próximas N horas.
export const JANELAS_PASSADO = { '1h': 1, '6h': 6, '24h': 24 };
export const JANELAS_FUTURO = { '+6h': 6, '+24h': 24 };
export const HORAS_PREVISTAS = 24;
// A série guardada vai além do necessário: o navegador recalcula as janelas a partir do "agora" dele,
// e o arquivo pode ter até ESTIMATIVA_VALIDA_MS de idade.
const SERIE_ANTES_H = 30;
const SERIE_DEPOIS_H = 36;
// A estimativa é coletada a cada 3 h; passou do dobro disso, deixa de ser usada.
export const ESTIMATIVA_RENOVAR_MS = 3 * 60 * 60 * 1000;
export const ESTIMATIVA_VALIDA_MS = 6 * 60 * 60 * 1000;

const HORA_S = 3600;
const arredondar = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

// Resposta horária de um ponto (`time` em segundos Unix, `precipitation` em mm da hora que TERMINA em `time`)
// -> série compacta { inicio, mm } em torno do "agora": SERIE_ANTES_H atrás e SERIE_DEPOIS_H à frente.
export function serieEstimativa({ time, precipitation }, agoraMs) {
  const de = agoraMs / 1000 - SERIE_ANTES_H * HORA_S;
  const ate = agoraMs / 1000 + SERIE_DEPOIS_H * HORA_S;
  const indices = time.map((t, i) => i).filter((i) => time[i] >= de && time[i] <= ate);
  if (!indices.length) return null;
  return { inicio: time[indices[0]], mm: indices.map((i) => arredondar(precipitation[i])) };
}

// Horas (fim de cada hora) da série como { t, mm }.
const horasDa = ({ inicio, mm }) => mm.map((v, i) => ({ t: (inicio + i * HORA_S) * 1000, mm: v }));
const completa = (horas, n) => horas.length === n && horas.every((h) => h.mm !== null);
const soma = (horas) => Math.round(horas.reduce((a, h) => a + h.mm, 0) * 10) / 10;

// Série -> acumulado por janela, relativo ao `agoraMs`. Janela sem todas as horas ou com buraco vira null:
// soma parcial subestimaria a chuva. Passado: horas que já terminaram. Futuro: as próximas horas cheias.
export function acumuladosEstimativa(serie, agoraMs) {
  const horas = horasDa(serie);
  const passadas = horas.filter((h) => h.t <= agoraMs);
  const futuras = horas.filter((h) => h.t > agoraMs);
  const r = {};
  for (const [janela, n] of Object.entries(JANELAS_PASSADO)) {
    const ultimas = passadas.slice(-n);
    r[janela] = completa(ultimas, n) ? soma(ultimas) : null;
  }
  for (const [janela, n] of Object.entries(JANELAS_FUTURO)) {
    const proximas = futuras.slice(0, n);
    r[janela] = completa(proximas, n) ? soma(proximas) : null;
  }
  return r;
}

// Próximas horas previstas, uma a uma (para o gráfico do cartão). Hora sem valor vem com mm null.
export const previsaoHoraria = (serie, agoraMs, n = HORAS_PREVISTAS) =>
  horasDa(serie).filter((h) => h.t > agoraMs).slice(0, n);

// `pontos[i]` é a resposta do município `codigos[i]`. Município com qualquer janela sem valor fica de fora.
export function normalizarEstimativa(pontos, codigos, agoraMs) {
  return codigos
    .map((codIbge, i) => ({ codIbge, serie: pontos[i]?.hourly ? serieEstimativa(pontos[i].hourly, agoraMs) : null }))
    .filter((m) => m.serie && Object.values(acumuladosEstimativa(m.serie, agoraMs)).every((v) => v !== null));
}

export const estimativaPrecisaRenovar = (geradoEm, agoraMs) =>
  !(Date.parse(geradoEm) > agoraMs - ESTIMATIVA_RENOVAR_MS);
