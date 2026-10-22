// Busca as estações do CEMADEN no RS e grava um JSON normalizado em data/chuva-rs.json.
// Fonte: Rede Observacional do CEMADEN/MCTI (endpoint público do Mapa Interativo).
import { mkdir, writeFile } from 'node:fs/promises';
import { normalizarChuvaCemaden } from '../src/normalizar.js';

const ENDPOINT = 'https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=RS';
const SAIDA = new URL('../data/chuva-rs.json', import.meta.url);
const TENTATIVAS = 5;

async function buscar() {
  for (let i = 1; i <= TENTATIVAS; i++) {
    try {
      const res = await fetch(ENDPOINT, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`tentativa ${i}/${TENTATIVAS} falhou: ${err.message} (${err.cause?.code ?? err.name})`);
      if (i === TENTATIVAS) throw err;
      await new Promise((r) => setTimeout(r, 5000 * i));
    }
  }
}

const bruto = await buscar();
const estacoes = normalizarChuvaCemaden(bruto, Date.now());

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  SAIDA,
  JSON.stringify({ geradoEm: new Date().toISOString(), fonte: 'CEMADEN/MCTI', estacoes }, null, 1),
);

const municipios = new Set(estacoes.map((e) => e.codIbge)).size;
console.log(`${estacoes.length} estações em ${municipios} municípios -> data/chuva-rs.json`);
