// Coleta notícias recentes sobre chuva, cheia e Defesa Civil no RS e grava data/noticias-rs.json.
// Só título, trecho curto, fonte, link e data: o site mostra o título e leva o leitor ao veículo.
// Fontes: feeds RSS públicos do G1 RS e da Agência Brasil (esta só entra se citar o RS).
import { mkdir, writeFile } from 'node:fs/promises';
import { lerRss, normalizarNoticias, selecionarNoticias } from '../src/noticias.js';

const FONTES = [
  { nome: 'G1 RS', url: 'https://g1.globo.com/rss/g1/rs/rio-grande-do-sul/', exigirRS: false },
  { nome: 'Agência Brasil', url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', exigirRS: true },
];
const SAIDA = new URL('../data/noticias-rs.json', import.meta.url);
const TENTATIVAS = 3;
const USER_AGENT = 'RadarChuvaRS/1.0 (+https://github.com/lukinas1417/radar-chuva-rs)';

async function baixar({ nome, url }) {
  for (let i = 1; i <= TENTATIVAS; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(25_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      console.warn(`${nome}: tentativa ${i}/${TENTATIVAS} falhou: ${err.message} (${err.cause?.code ?? err.name})`);
      if (i === TENTATIVAS) throw err;
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
}

const agora = Date.now();
const noticias = [];
const fontesOk = [];
for (const fonte of FONTES) {
  try {
    const itens = lerRss(await baixar(fonte));
    const relevantes = normalizarNoticias(itens, { fonte: fonte.nome, agoraMs: agora, exigirRS: fonte.exigirRS });
    console.log(`${fonte.nome}: ${itens.length} itens lidos, ${relevantes.length} relevantes`);
    noticias.push(...relevantes);
    fontesOk.push(fonte.nome);
  } catch {
    // uma fonte fora do ar não derruba as outras
  }
}

// Sem nenhuma fonte, falha de propósito: o workflow reaproveita o último arquivo publicado.
if (!fontesOk.length) {
  console.error('nenhuma fonte de notícias respondeu');
  process.exit(1);
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(
  SAIDA,
  JSON.stringify({ geradoEm: new Date(agora).toISOString(), fontes: fontesOk, noticias: selecionarNoticias(noticias, agora) }, null, 1),
);
console.log(`${selecionarNoticias(noticias, agora).length} notícias -> data/noticias-rs.json (fontes: ${fontesOk.join(', ')})`);
