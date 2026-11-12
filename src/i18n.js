// Idioma da interface: inglês por padrão; português com ?lang=pt ou pelo botão EN/PT. A escolha fica salva no navegador.
// O HTML estático já vem em inglês (para quem não roda JavaScript e para buscadores); o português dele está em PT_HTML.
// Textos montados pelo JavaScript usam L(português, inglês), com os dois lado a lado no ponto de uso.

const CHAVE = 'radar-idioma';
const lido = () => {
  try { return globalThis.localStorage?.getItem(CHAVE) ?? null; } catch { return null; }
};
const pedido = () => {
  try { return new URLSearchParams(globalThis.location?.search ?? '').get('lang'); } catch { return null; }
};

export const escolherIdioma = (pedidoUrl, salvo) => (['pt', 'en'].includes(pedidoUrl) ? pedidoUrl : ['pt', 'en'].includes(salvo) ? salvo : 'en');

export const idioma = escolherIdioma(pedido(), lido());
export const EN = idioma === 'en';
export const LOCALE = EN ? 'en-GB' : 'pt-BR'; // en-GB: horas de 24 h e dia/mês, como no Brasil
export const L = (pt, en) => (EN ? en : pt);

export function trocarIdioma() {
  try { globalThis.localStorage?.setItem(CHAVE, EN ? 'pt' : 'en'); } catch { /* navegação privada */ }
  const url = new URL(location.href);
  url.searchParams.delete('lang'); // a escolha salva vale; ?lang= só serve para compartilhar um link
  location.href = url.toString();
}

// Português do HTML estático (o inglês é o próprio HTML). Chave = data-i18n; data-i18n-attr troca atributos.
export const PT_HTML = {
  'doc.title': 'Radar de Chuva RS - Brasil',
  'doc.desc': 'Chuva, previsão, nível dos rios e suscetibilidade a inundação e deslizamento, município a município, no Rio Grande do Sul. Dados do CEMADEN, da Defesa Civil RS e da ANA.',
  'brand': 'Radar de Chuva <b>RS</b>',
  'map.label': 'Mapa de chuva acumulada e risco de rios por município do Rio Grande do Sul',
  'search.ph': 'Buscar município',
  'locate': 'Usar minha localização',
  'loading': 'Carregando…',
  'news.btn': 'Notícias',
  'layers.label': 'Camadas do mapa',
  'relief.label': 'Alternar relevo 3D',
  'relief.title': 'Relevo 3D',
  'about.label': 'Sobre os dados',
  'lang.title': 'Switch to English',
  'zoom.label': 'Zoom do mapa',
  'recenter.label': 'Voltar à visão do estado todo',
  'recenter': 'Ver o RS todo',
  'news.panel': 'Notícias recentes',
  'invite.q': 'Quer ver a sua cidade?',
  'invite.body': ' Usamos a localização aproximada só no seu navegador. Nada é enviado nem guardado.',
  'invite.yes': 'Usar minha localização',
  'invite.no': 'Agora não',
  'win.label': 'Janela de chuva: acumulado passado ou previsão',
  'win.rain': 'Chuva',
  'win.1h': 'Acumulado na última hora',
  'win.6h': 'Acumulado nas últimas 6 horas',
  'win.24h': 'Acumulado nas últimas 24 horas',
  'win.+6h': 'Previsão das próximas 6 horas',
  'win.+24h': 'Previsão das próximas 24 horas',
  'legend.label': 'Legenda',
  'about.h': 'Sobre os dados',
  'about.rain': '<b>Chuva.</b> DADOS DA REDE OBSERVACIONAL DO CEMADEN/MCTIC, pluviômetros da Defesa Civil do RS e estações da Agência Nacional de Águas (ANA, a maioria em usinas e barragens). O valor de cada município é o maior acumulado entre as estações ativas dele. Os botões <b>1 h, 6 h e 24 h</b> mostram o que já choveu; <b>+6 h e +24 h</b> mostram a previsão.',
  'about.est': '<b>Estimativa e previsão.</b> A previsão vem sempre do modelo. Onde não há medição recente, o mapa mostra (transparente, com “~”) a chuva estimada pelo modelo <a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0) no centro do município. É um modelo, não um pluviômetro: pode errar, principalmente em temporais localizados.',
  'about.rivers': '<b>Rios.</b> Rede Hidrometeorológica da Defesa Civil do RS. O contorno luminoso indica a situação informada por ela (atenção, alerta ou inundação) e pode refletir o maior nível recente, não só o atual. Estações da <a href="https://www.ana.gov.br/hidrowebservice/swagger-ui/index.html">ANA (HidroWebService)</a> complementam com a leitura da régua (cota), de hora em hora, mas a ANA não divulga limiares de alerta: elas <b>não têm classificação de risco</b> e não entram no contorno luminoso nem no resumo de rios.',
  'about.news': '<b>Notícias.</b> Títulos e links do G1 RS e da Agência Brasil (feeds RSS públicos), escolhidos automaticamente por palavras-chave, o que pode errar. O conteúdo é dos veículos: os links levam até eles.',
  'about.terrain': '<b>Suscetibilidade.</b> Cartas de Suscetibilidade a Movimentos Gravitacionais de Massa e Inundações do <a href="https://www.sgb.gov.br/pt/web/guest/rio-grande-do-sul-cartografia-de-suscetibilidade">Serviço Geológico do Brasil (SGB/CPRM)</a>, exibidas com citação da fonte, conforme orientação da Ouvidoria do SGB. Mostram onde o terreno tende a inundar ou deslizar, em escala e com finalidade próprias (planejamento territorial): <b>não indicam o que está acontecendo agora</b> nem a chuva do dia. Existem só para alguns municípios; onde não há carta, isso <b>não</b> quer dizer que não há risco. As cartas ficam sempre visíveis, em qualquer zoom; no movimento de massa só as classes média e alta são hachuradas, porque a classe baixa cobre quase todo o município. As cores originais do SGB foram trocadas para não se confundir com a chuva.',
  'about.map': '<b>Mapa.</b> Malha municipal do IBGE. Relevo: Mapzen/AWS Terrain Tiles.',
  'about.grey': '<b>Município em cinza escuro</b> está sem medição e sem estimativa no momento, o que não significa ausência de chuva.',
  'about.warn': '<b>Este projeto não substitui os alertas oficiais.</b> Em emergência, siga a Defesa Civil: SMS 40199 com seu CEP, ou 199.',
  'about.code': '<a href="https://github.com/lukinas1417/radar-chuva-rs">Código aberto no GitHub</a>',
  'foot.warn': 'Não substitui os alertas oficiais · SMS 40199',
  'foot.src': 'Dados: CEMADEN/MCTIC, Defesa Civil RS, ANA, Open-Meteo, IBGE, SGB',
};

// Aplica o idioma ao HTML estático. No inglês não há nada a trocar: o HTML já está em inglês.
export function aplicarHtml(raiz = document) {
  raiz.documentElement.lang = EN ? 'en' : 'pt-BR';
  if (EN) return;
  document.title = PT_HTML['doc.title'];
  raiz.querySelector('meta[name="description"]')?.setAttribute('content', PT_HTML['doc.desc']);
  raiz.querySelectorAll('[data-i18n]').forEach((el) => {
    const t = PT_HTML[el.dataset.i18n];
    if (t === undefined) return;
    if (el.dataset.i18nHtml !== undefined) el.innerHTML = t;
    else el.textContent = t;
  });
  raiz.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const par of el.dataset.i18nAttr.split(';')) {
      const [attr, chave] = par.split(':');
      if (PT_HTML[chave] !== undefined) el.setAttribute(attr, PT_HTML[chave]);
    }
  });
}
