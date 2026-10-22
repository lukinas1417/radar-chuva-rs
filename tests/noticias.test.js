// Notícias: leitura do RSS, relevância, recência e ligação com o município.
// O que mais importa: não mostrar notícia velha como recente e não atribuir uma notícia do estado a uma cidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificacao, decodificar, lerRss, mencionaMunicipio, normalizarNoticias, noticiasPara, pontuar, selecionarNoticias } from '../src/noticias.js';

const AGORA = Date.parse('2026-10-22T12:00:00Z');
const horasAtras = (h) => new Date(AGORA - h * 3600e3).toUTCString();
const noticia = (extra) => ({
  titulo: 'Defesa Civil alerta para tempestades no RS',
  trecho: '',
  fonte: 'Teste',
  url: 'https://exemplo.com/a',
  publicadoEm: new Date(AGORA - 3600e3).toISOString(),
  pontos: 12,
  termos: [],
  ...extra,
});

// ---------- leitura do RSS ----------

test('decodifica entidades em uma só passada, sem decodificar duas vezes', () => {
  assert.equal(decodificar('&amp;lt;b&amp;gt;'), '&lt;b&gt;');
  assert.equal(decodificar('Caxias &amp; Gramado'), 'Caxias & Gramado');
  assert.equal(decodificar('S&#227;o Jos&#xE9;'), 'São José');
  assert.equal(decodificar('&quot;cheia&quot;'), '"cheia"');
});

test('lê título e trecho de CDATA e de HTML escapado, sem as tags', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Chuva forte atinge a Serra]]></title><link>https://g1.exemplo/a</link>
      <description>&lt;p&gt;Volumes de &lt;b&gt;100 mm&lt;/b&gt; em 24 horas&lt;/p&gt;</description><pubDate>${horasAtras(2)}</pubDate></item>
  </channel></rss>`;
  const [item] = lerRss(xml);
  assert.equal(item.titulo, 'Chuva forte atinge a Serra');
  assert.equal(item.trecho, 'Volumes de 100 mm em 24 horas');
  assert.equal(item.url, 'https://g1.exemplo/a');
});

test('usa o subtítulo quando o feed o traz', () => {
  const xml = `<item><title>T</title><atom:subtitle>Subtítulo da matéria</atom:subtitle><description>outro</description>
    <link>https://g1.exemplo/b</link><pubDate>${horasAtras(1)}</pubDate></item>`;
  assert.equal(lerRss(xml)[0].trecho, 'Subtítulo da matéria');
});

test('descarta item sem título, sem link válido ou sem data válida', () => {
  const xml = `
    <item><title></title><link>https://x.exemplo/1</link><pubDate>${horasAtras(1)}</pubDate></item>
    <item><title>Sem link</title><link>javascript:alert(1)</link><pubDate>${horasAtras(1)}</pubDate></item>
    <item><title>Sem data</title><link>https://x.exemplo/3</link><pubDate>ontem</pubDate></item>
    <item><title>Ok</title><link>https://x.exemplo/4</link><pubDate>${horasAtras(1)}</pubDate></item>`;
  assert.deepEqual(lerRss(xml).map((i) => i.titulo), ['Ok']);
});

// ---------- relevância e recência ----------

test('termo no título pesa mais que o mesmo termo só no trecho', () => {
  assert.ok(pontuar('Enchente atinge a cidade', '').pontos > pontuar('Cidade em alerta', 'após enchente').pontos);
});

test('texto sem relação com o tema não pontua', () => {
  assert.equal(pontuar('Prefeitura inaugura praça', 'Obra custou R$ 2 milhões').pontos, 0);
});

const bruto = (extra) => ({ titulo: 'Defesa Civil alerta para tempestades no RS', trecho: '', url: 'https://x.exemplo/1', publicadoEm: AGORA - 3600e3, ...extra });
const normalizar = (itens, extra) => normalizarNoticias(itens, { fonte: 'Teste', agoraMs: AGORA, ...extra });

test('notícia com mais de 72 horas não é recente e fica de fora', () => {
  assert.equal(normalizar([bruto({ publicadoEm: AGORA - 71 * 3600e3 })]).length, 1);
  assert.equal(normalizar([bruto({ publicadoEm: AGORA - 73 * 3600e3 })]).length, 0);
});

test('data no futuro (relógio da fonte adiantado) é descartada', () => {
  assert.equal(normalizar([bruto({ publicadoEm: AGORA + 3 * 3600e3 })]).length, 0);
});

test('abaixo da pontuação mínima, a notícia não entra', () => {
  assert.equal(normalizar([bruto({ titulo: 'Prefeitura inaugura praça', trecho: '' })]).length, 0);
});

test('fonte nacional só entra se citar o Rio Grande do Sul', () => {
  const nacional = bruto({ titulo: 'Chuvas: Defesa Civil decreta emergência em cidades do Sul', trecho: 'Em Santa Catarina' });
  const comRS = bruto({ titulo: 'Chuvas: Defesa Civil decreta emergência', trecho: 'no Rio Grande do Sul' });
  assert.equal(normalizar([nacional], { exigirRS: true }).length, 0);
  assert.equal(normalizar([comRS], { exigirRS: true }).length, 1);
  assert.equal(normalizar([nacional], { exigirRS: false }).length, 1);
});

test('a relevância cai com a idade: uma forte de ontem ganha de uma média de ontem', () => {
  const forte = noticia({ pontos: 15, publicadoEm: new Date(AGORA - 24 * 3600e3).toISOString() });
  const media = noticia({ pontos: 6, publicadoEm: new Date(AGORA - 24 * 3600e3).toISOString() });
  assert.ok(classificacao(forte, AGORA) > classificacao(media, AGORA));
  const recente = noticia({ pontos: 6, publicadoEm: new Date(AGORA - 1 * 3600e3).toISOString() });
  assert.ok(classificacao(recente, AGORA) > classificacao(media, AGORA));
});

test('títulos repetidos (mesmo com acento e pontuação diferentes) aparecem uma vez', () => {
  const lista = [noticia({ titulo: 'Chuva volta ao RS!' }), noticia({ titulo: 'chuva volta ao rs', url: 'https://exemplo.com/b' })];
  assert.equal(selecionarNoticias(lista, AGORA).length, 1);
});

test('a previsão do tempo de uma cidade fica só com a edição mais recente', () => {
  const lista = [
    noticia({ titulo: 'Previsão do tempo hoje para Caxias do Sul (RS): sol', publicadoEm: new Date(AGORA - 30 * 3600e3).toISOString(), pontos: 4 }),
    noticia({ titulo: 'Previsão do tempo hoje para Caxias do Sul (RS): nublado', publicadoEm: new Date(AGORA - 6 * 3600e3).toISOString(), pontos: 4 }),
    noticia({ titulo: 'Previsão do tempo hoje para Porto Alegre (RS): sol', pontos: 4 }),
  ];
  const resultado = selecionarNoticias(lista, AGORA);
  assert.equal(resultado.filter((n) => n.titulo.includes('Caxias')).length, 1);
  assert.ok(resultado.find((n) => n.titulo.includes('Caxias')).titulo.includes('nublado'));
  assert.equal(resultado.length, 2);
});

test('respeita o limite pedido', () => {
  const lista = Array.from({ length: 10 }, (_, i) => noticia({ titulo: `Notícia ${i}`, url: `https://exemplo.com/${i}` }));
  assert.equal(selecionarNoticias(lista, AGORA, 4).length, 4);
});

// ---------- ligação com o município ----------

test('cidade é achada sem acento e sem diferenciar maiúsculas', () => {
  assert.equal(mencionaMunicipio(noticia({ titulo: 'Chuva atinge SÃO LEOPOLDO' }), 'São Leopoldo'), true);
  assert.equal(mencionaMunicipio(noticia({ titulo: 'Chuva atinge sao leopoldo' }), 'São Leopoldo'), true);
});

test('"Rio Grande" não casa com "Rio Grande do Sul", mas casa com a cidade', () => {
  assert.equal(mencionaMunicipio(noticia({ titulo: 'Chuva no Rio Grande do Sul' }), 'Rio Grande'), false);
  assert.equal(mencionaMunicipio(noticia({ titulo: 'Porto de Rio Grande (RS) para por causa do vento' }), 'Rio Grande'), true);
});

test('a cidade é comparada por palavra inteira, não por pedaço', () => {
  assert.equal(mencionaMunicipio(noticia({ titulo: 'Céu estrelado em Gramado' }), 'Estrela'), false);
  assert.equal(mencionaMunicipio(noticia({ titulo: 'Chuva em Estrela (RS)' }), 'Estrela'), true);
});

test('o trecho também conta para achar a cidade', () => {
  assert.equal(mencionaMunicipio(noticia({ titulo: 'Alerta de temporal', trecho: 'Moradores de Pelotas ficaram sem luz' }), 'Pelotas'), true);
});

test('com notícias da cidade, devolve só elas e marca que são do município', () => {
  const lista = [noticia({ titulo: 'Temporal em Pelotas' }), noticia({ titulo: 'Alerta no RS', url: 'https://exemplo.com/z' })];
  const r = noticiasPara(lista, 'Pelotas', { agoraMs: AGORA });
  assert.equal(r.doMunicipio, true);
  assert.deepEqual(r.lista.map((n) => n.titulo), ['Temporal em Pelotas']);
});

test('sem notícias da cidade, cai nas do estado e NÃO diz que são do município', () => {
  const lista = [noticia({ titulo: 'Alerta no RS' })];
  const r = noticiasPara(lista, 'Pelotas', { agoraMs: AGORA });
  assert.equal(r.doMunicipio, false);
  assert.equal(r.lista.length, 1);
});

test('sem município selecionado, mostra as do estado, um pouco mais', () => {
  const lista = Array.from({ length: 10 }, (_, i) => noticia({ titulo: `Alerta ${i}`, url: `https://exemplo.com/${i}` }));
  assert.equal(noticiasPara(lista, null, { agoraMs: AGORA, limite: 3 }).lista.length, 5);
  assert.equal(noticiasPara(lista, 'Pelotas', { agoraMs: AGORA, limite: 3 }).lista.length, 3);
});
