// Busca as estações do CEMADEN no RS e grava um JSON normalizado em data/chuva-rs.json.
// Fonte: Rede Observacional do CEMADEN/MCTI (endpoint público do Mapa Interativo).
import { mkdir, writeFile } from 'node:fs/promises';

const ENDPOINT = 'https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=RS';
const SAIDA = new URL('../data/chuva-rs.json', import.meta.url);
const TENTATIVAS = 3;

async function buscar() {
  for (let i = 1; i <= TENTATIVAS; i++) {
    try {
      const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`tentativa ${i}/${TENTATIVAS} falhou: ${err.message}`);
      if (i === TENTATIVAS) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

// "21/10/26 19:10" (horário de Brasília) -> ISO 8601 com offset
function paraIso(texto) {
  const m = texto?.match(/^(\d+)\/(\d+)\/(\d+) (\d+):(\d+)$/);
  if (!m) return null;
  const [, d, mo, a, h, mi] = m.map((v, i) => (i ? v.padStart(2, '0') : v));
  return `20${a}-${mo}-${d}T${h}:${mi}:00-03:00`;
}

// O CEMADEN só preenche o acumulado quando choveu na janela: "-" em estação ativa é 0 mm.
// Estação sem leitura recente é "sem dado" (null).
const ATIVA_ATE_MS = 3 * 60 * 60 * 1000;
const numero = (v, ativa) => (typeof v === 'number' ? v : ativa ? 0 : null);

const bruto = await buscar();
const agora = Date.now();
const estacoes = bruto.map((e) => {
  const ultimaLeitura = paraIso(e.datahoraUltimovalor);
  const ativa = ultimaLeitura !== null && agora - Date.parse(ultimaLeitura) <= ATIVA_ATE_MS;
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

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  SAIDA,
  JSON.stringify({ geradoEm: new Date().toISOString(), fonte: 'CEMADEN/MCTI', estacoes }, null, 1),
);

const municipios = new Set(estacoes.map((e) => e.codIbge)).size;
console.log(`${estacoes.length} estações em ${municipios} municípios -> data/chuva-rs.json`);
