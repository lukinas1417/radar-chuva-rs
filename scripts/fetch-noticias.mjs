// Coleta notícias recentes sobre chuva, cheia e Defesa Civil no RS e grava data/noticias-rs.json.
// Só título, trecho curto, fonte, link e data: o site mostra o título e leva o leitor ao veículo.
// Fontes: feeds RSS públicos do G1 RS e da Agência Brasil (esta só entra se citar o RS).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { lerRss, lerTraducao, normalizarNoticias, reaproveitarTraducoes, selecionarNoticias } from '../src/noticias.js';

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

// Títulos em inglês: reaproveita os já traduzidos (arquivo local ou publicado) e traduz só os novos, com teto por execução
// para respeitar a cota gratuita do MyMemory (sem chave, sem e-mail: só o título público da notícia é enviado).
const MAX_TRADUCOES = 12;
async function arquivoAnterior() {
  try {
    if (process.env.PUBLICADO) {
      const res = await fetch(process.env.PUBLICADO, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return (await res.json()).noticias;
    }
    return JSON.parse(await readFile(SAIDA, 'utf8')).noticias;
  } catch {
    return [];
  }
}
async function traduzir(titulo) {
  try {
    const url = 'https://api.mymemory.translated.net/get?langpair=pt|en&q=' + encodeURIComponent(titulo);
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
    return res.ok ? lerTraducao(await res.json(), titulo) : null;
  } catch {
    return null;
  }
}

const escolhidas = reaproveitarTraducoes(selecionarNoticias(noticias, agora), await arquivoAnterior());
let feitas = 0;
for (const n of escolhidas) {
  if (n.tituloEn || feitas >= MAX_TRADUCOES) continue;
  feitas++;
  const en = await traduzir(n.titulo);
  if (en) n.tituloEn = en;
}
console.log(`${escolhidas.filter((n) => n.tituloEn).length}/${escolhidas.length} títulos com tradução (${feitas} tentativas nesta execução)`);

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(SAIDA, JSON.stringify({ geradoEm: new Date(agora).toISOString(), fontes: fontesOk, noticias: escolhidas }, null, 1));
console.log(`${escolhidas.length} notícias -> data/noticias-rs.json (fontes: ${fontesOk.join(', ')})`);
