// Notícias: leitura de RSS, relevância para chuva e enchente, e ligação com municípios.
// Funções puras (sem rede nem relógio global), para rodar no Node (coleta) e no navegador (exibição).
// Só guardamos título, um trecho curto (usado para achar a cidade), fonte, link e data: nunca o texto da matéria.
import { semAcento } from './dados.js';

export const MAX_IDADE_MS = 72 * 60 * 60 * 1000; // notícia com mais de 72 h não é "recente"
export const PONTOS_MINIMOS = 3;

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Decodifica entidades HTML em uma só passada (para "&amp;lt;" não virar "<").
export function decodificar(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (inteiro, c) => {
    if (c[0] === '#') {
      const codigo = c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : Number(c.slice(1));
      return Number.isFinite(codigo) && codigo > 0 && codigo < 0x110000 ? String.fromCodePoint(codigo) : inteiro;
    }
    return ENTIDADES[c.toLowerCase()];
  });
}

const tirarTags = (html) => html.replace(/<[^>]*>/g, ' ');
const limpar = (t) => (t == null ? '' : decodificar(tirarTags(decodificar(t))).replace(/\s+/g, ' ').trim());

function campo(bloco, nome) {
  const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'));
  if (!m) return null;
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

// RSS 2.0 -> itens crus. Item sem título, link ou data válida é descartado.
export function lerRss(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)]
    .map(([, bloco]) => ({
      titulo: limpar(campo(bloco, 'title')),
      trecho: limpar(campo(bloco, 'atom:subtitle') ?? campo(bloco, 'description')).slice(0, 220),
      url: decodificar(campo(bloco, 'link') ?? ''),
      publicadoEm: Date.parse(campo(bloco, 'pubDate') ?? ''),
    }))
    .filter((i) => i.titulo && /^https?:\/\//.test(i.url) && Number.isFinite(i.publicadoEm));
}

// [expressão, peso]. Um termo no título vale o dobro de um termo só no trecho.
const TERMOS = [
  [/enchente|alagament|inunda[cç][aã]o|inundad|transbord/i, 5],
  [/cheia|n[ií]vel d[oa]s? rios?|n[ií]vel do (rio|gua[ií]ba|lago)/i, 4],
  [/deslizament|desbarranc/i, 4],
  [/ciclone|tornado|vendaval|granizo|tempestade|temporal|ventania/i, 3],
  [/defesa civil|situa[cç][aã]o de emerg[eê]ncia|estado de calamidade/i, 3],
  [/chuva|chuvoso|precipita[cç]/i, 2],
  [/previs[aã]o do tempo|meteorolog|inmet|metsul|cemaden/i, 1],
];

export function pontuar(titulo, trecho) {
  let pontos = 0;
  const termos = [];
  for (const [regra, peso] of TERMOS) {
    if (regra.test(titulo)) pontos += peso * 2;
    else if (regra.test(trecho)) pontos += peso;
    else continue;
    termos.push(regra.source.split('|')[0].replace(/[^a-zçãõáéíóú ]/gi, ''));
  }
  return { pontos, termos };
}

const fala = /rio grande do sul|\bRS\b|ga[úu]ch/i;

// Itens crus de uma fonte -> notícias relevantes e recentes.
// `exigirRS`: fontes nacionais só entram se citarem o estado.
export function normalizarNoticias(itens, { fonte, agoraMs, exigirRS = false }) {
  return itens
    .filter((i) => agoraMs - i.publicadoEm <= MAX_IDADE_MS && i.publicadoEm <= agoraMs + 10 * 60 * 1000)
    .filter((i) => !exigirRS || fala.test(`${i.titulo} ${i.trecho}`))
    .map((i) => {
      const { pontos, termos } = pontuar(i.titulo, i.trecho);
      return { titulo: i.titulo, trecho: i.trecho, fonte, url: i.url, publicadoEm: new Date(i.publicadoEm).toISOString(), pontos, termos };
    })
    .filter((n) => n.pontos >= PONTOS_MINIMOS);
}

// A relevância cai com a idade: uma notícia forte de ontem ainda aparece, uma média de anteontem não.
export const classificacao = (n, agoraMs) => n.pontos / (1 + (agoraMs - Date.parse(n.publicadoEm)) / (24 * 3600e3));

// A previsão do tempo de cada cidade sai todo dia com título quase igual: fica só a mais recente por cidade.
const previsaoDe = (titulo) => titulo.match(/^previs[aã]o do tempo hoje para (.+?) \(/i)?.[1];

// Junta as fontes, tira títulos repetidos e fica com as mais relevantes.
export function selecionarNoticias(lista, agoraMs, limite = 40) {
  const vistos = new Set();
  return lista
    .sort((a, b) => classificacao(b, agoraMs) - classificacao(a, agoraMs))
    .filter((n) => {
      const cidade = previsaoDe(n.titulo);
      const chave = cidade ? `previsao ${semAcento(cidade)}` : semAcento(n.titulo).replace(/[^a-z0-9]+/g, ' ').trim();
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .slice(0, limite);
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A notícia cita o município? Compara sem acento e por palavra inteira. "Rio Grande" não pode casar com
// "Rio Grande do Sul", senão toda notícia do estado apareceria como sendo da cidade.
export function mencionaMunicipio(noticia, nome) {
  const alvo = semAcento(nome);
  const texto = semAcento(`${noticia.titulo} ${noticia.trecho}`);
  const depois = alvo === 'rio grande' ? '(?! do sul)' : '';
  return new RegExp(`(^|[^a-z])${escapar(alvo)}${depois}(?![a-z])`).test(texto);
}

// Notícias do município, ou, se não houver nenhuma, as do estado. `doMunicipio` diz de qual caso se trata.
export function noticiasPara(noticias, nomeMunicipio, { agoraMs, limite = 3 } = {}) {
  const ordenadas = [...noticias].sort((a, b) => classificacao(b, agoraMs) - classificacao(a, agoraMs));
  if (nomeMunicipio) {
    const daCidade = ordenadas.filter((n) => mencionaMunicipio(n, nomeMunicipio)).slice(0, limite);
    if (daCidade.length) return { doMunicipio: true, lista: daCidade };
  }
  return { doMunicipio: false, lista: ordenadas.slice(0, nomeMunicipio ? limite : limite + 2) };
}
