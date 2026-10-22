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
