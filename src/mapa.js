// Mapa em tela cheia: relevo 3D, municípios coloridos pela chuva e brilho pulsante nos rios em risco.
import { SITUACOES, chuvaDoMunicipio, faixaDe, riscoDoMunicipio } from './dados.js';

const TILES_RELEVO = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const LIMITES_RS = [[-57.7, -33.8], [-49.6, -27.0]];
// Até onde dá para arrastar o mapa. É só uma rede de segurança para não se perder no oceano ou em outro país;
// quem impede de ver "dois RS" é o zoom mínimo, e esta área precisa ser larga para não encolher a folga dele.
const LIMITES_PAN = [[-68, -40], [-39, -20]];
// Mais que isso só mostra as arestas da malha simplificada; o nível de cidade já é o útil.
const ZOOM_MAXIMO = 10.5;
const COR_SEM_DADO = '#101c29';
const INCLINACAO = 36;
const REDUZIR_MOVIMENTO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TEM_HOVER = matchMedia('(hover: hover)').matches;

const celular = () => innerWidth < 760;

// Espaço ocupado pela interface flutuante, para o estado não ficar escondido atrás dela.
function margens(comCartao = false) {
  if (celular()) return { top: 150, bottom: comCartao ? 350 : 190, left: 12, right: 12 };
  return { top: 56, bottom: 84, left: 340, right: comCartao ? 400 : 30 };
}

export function criarMapa({ container, dados, aoSelecionar, aoPassar, aoAfastar, aoZoom }) {
  const mapa = new maplibregl.Map({
    container,
    style: { version: 8, sources: {}, layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': '#070d14' } }] },
    bounds: LIMITES_RS,
    fitBoundsOptions: { padding: margens() },
    maxBounds: LIMITES_PAN,
    maxZoom: ZOOM_MAXIMO,
    maxPitch: 70,
    attributionControl: false,
  });

  let relevoLigado = false; // vista de cima por padrão; o relevo 3D é opcional
  let pronto = false;
  let janelaAtual = '24h';
  let marcadorLocal = null;
  let cartaoAberto = false;
  let codSelecionado = null;
  let codEu = null; // município do usuário, destacado com um brilho suave

  // O zoom mínimo é o do enquadramento do estado (com ou sem cartão) menos uma folga curta: dá para se
  // afastar um pouco, mas não a ponto de ver o estado pequeno com espaço vazio em volta. Depende do tamanho da tela.
  function emitirZoom() {
    aoZoom?.(mapa.getZoom(), mapa.getMinZoom(), mapa.getMaxZoom());
  }
  function ajustarLimites() {
    const zooms = [false, true].map((comCartao) => mapa.cameraForBounds(LIMITES_RS, { padding: margens(comCartao) })?.zoom).filter(Number.isFinite);
    if (zooms.length) mapa.setMinZoom(Math.min(...zooms) - 0.25);
    emitirZoom();
  }
  ajustarLimites();
  addEventListener('resize', ajustarLimites);
  mapa.on('zoom', emitirZoom);

  // Enquadramento padrão (o estado todo), para saber quando o usuário se afastou dele.
  // O enquadramento muda um pouco com o cartão aberto (ele ocupa parte da tela), então compara com os dois.
  function conferirAfastamento() {
    const c = mapa.getCenter();
    const padroes = [false, true].map((comCartao) => mapa.cameraForBounds(LIMITES_RS, { padding: margens(comCartao) }));
    const zoomAlto = Math.max(...padroes.map((p) => p.zoom));
    const longe = padroes.every((p) => Math.hypot(c.lng - p.center.lng, c.lat - p.center.lat) > 1.5);
    aoAfastar?.(mapa.getZoom() > zoomAlto + 0.4 || longe);
  }

  function pintar(janela) {
    janelaAtual = janela;
    for (const f of dados.malha.features) {
      const cod = f.properties.codIbge;
      const chuva = chuvaDoMunicipio(dados, cod, janela);
      const risco = riscoDoMunicipio(dados, cod) ?? 0;
      Object.assign(f.properties, {
        cor: chuva === null ? COR_SEM_DADO : faixaDe(chuva.mm).cor,
        op: chuva === null ? 0.62 : chuva.tipo === 'estimado' ? 0.5 : 0.84, // estimado fica mais transparente que o medido
        risco,
        corRisco: SITUACOES.find((s) => s.valor === risco)?.cor ?? '#ffffff',
      });
    }
    if (pronto) mapa.getSource('municipios').setData(dados.malha);
  }

  function inclinar(ligado) {
    mapa.setTerrain(ligado ? { source: 'relevo', exaggeration: 1.6 } : null);
    mapa.easeTo({ pitch: ligado ? INCLINACAO : 0, bearing: ligado ? -8 : 0, duration: REDUZIR_MOVIMENTO ? 0 : 900 });
  }

  mapa.on('load', () => {
    mapa.addSource('relevo', { type: 'raster-dem', tiles: [TILES_RELEVO], encoding: 'terrarium', tileSize: 256, maxzoom: 12 });
    mapa.addSource('sombra', { type: 'raster-dem', tiles: [TILES_RELEVO], encoding: 'terrarium', tileSize: 256, maxzoom: 12 });
    mapa.addSource('municipios', { type: 'geojson', data: dados.malha, promoteId: 'codIbge' });

    mapa.addLayer({
      id: 'preenchimento',
      type: 'fill',
      source: 'municipios',
      paint: { 'fill-color': ['get', 'cor'], 'fill-opacity': ['get', 'op'] },
    });
    mapa.addLayer({
      id: 'sombra',
      type: 'hillshade',
      source: 'sombra',
      paint: {
        'hillshade-exaggeration': 0.7,
        'hillshade-shadow-color': 'rgba(0,0,0,0.55)',
        'hillshade-highlight-color': 'rgba(190,215,240,0.22)',
        'hillshade-accent-color': 'rgba(0,0,0,0.25)',
      },
    });
    mapa.addLayer({
      id: 'contorno',
      type: 'line',
      source: 'municipios',
      paint: { 'line-color': 'rgba(210,225,240,0.16)', 'line-width': 0.5 },
    });

    const emRisco = ['>=', ['get', 'risco'], 1];
    mapa.addLayer({
      id: 'risco-brilho',
      type: 'line',
      source: 'municipios',
      filter: emRisco,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'corRisco'], 'line-width': 8, 'line-blur': 7, 'line-opacity': 0.55 },
    });
    mapa.addLayer({
      id: 'risco-linha',
      type: 'line',
      source: 'municipios',
      filter: emRisco,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'corRisco'], 'line-width': 1.8, 'line-opacity': 0.95 },
    });
    const nenhum = ['==', ['get', 'codIbge'], -1];
    // Brilho suave no município do usuário (cor de destaque da interface, diferente das cores de risco).
    mapa.addLayer({
      id: 'eu-brilho',
      type: 'line',
      source: 'municipios',
      filter: nenhum,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#7dd3fc', 'line-width': 9, 'line-blur': 8, 'line-opacity': 0.6 },
    });
    mapa.addLayer({
      id: 'eu-linha',
      type: 'line',
      source: 'municipios',
      filter: nenhum,
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#7dd3fc', 'line-width': 2, 'line-opacity': 0.95 },
    });
    mapa.addLayer({ id: 'hover', type: 'line', source: 'municipios', filter: nenhum, paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.7 } });
    mapa.addLayer({ id: 'selecionado', type: 'line', source: 'municipios', filter: nenhum, layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2.6 } });

    pronto = true;
    pintar(janelaAtual);
    if (codSelecionado !== null) mapa.setFilter('selecionado', ['==', ['get', 'codIbge'], codSelecionado]);
    if (codEu !== null) aplicarEu();
    if (relevoLigado) inclinar(true);
    pulsar();
    mapa.on('moveend', conferirAfastamento);
    conferirAfastamento();

    mapa.on('click', (ev) => {
      const [f] = mapa.queryRenderedFeatures(ev.point, { layers: ['preenchimento'] });
      aoSelecionar(f ? f.properties.codIbge : null);
    });
    if (TEM_HOVER) {
      mapa.on('mousemove', (ev) => {
        const [f] = mapa.queryRenderedFeatures(ev.point, { layers: ['preenchimento'] });
        mapa.getCanvas().style.cursor = f ? 'pointer' : '';
        mapa.setFilter('hover', f ? ['==', ['get', 'codIbge'], f.properties.codIbge] : nenhum);
        aoPassar(f ? f.properties.codIbge : null, ev.point);
      });
      mapa.on('mouseout', () => aoPassar(null));
    }
  });

  // Respiração suave do contorno dos municípios em risco (~30 quadros por segundo).
  function pulsar() {
    if (REDUZIR_MOVIMENTO) return;
    let ultimo = 0;
    const quadro = (t) => {
      if (t - ultimo > 33) {
        ultimo = t;
        const k = (Math.sin(t / 650) + 1) / 2;
        mapa.setPaintProperty('risco-brilho', 'line-opacity', 0.25 + 0.6 * k);
        mapa.setPaintProperty('risco-brilho', 'line-width', 6 + 6 * k);
        if (codEu !== null) {
          // mais lento que o dos rios, para os dois não parecerem o mesmo alerta
          const e = (Math.sin(t / 900) + 1) / 2;
          mapa.setPaintProperty('eu-brilho', 'line-opacity', 0.2 + 0.65 * e);
          mapa.setPaintProperty('eu-brilho', 'line-width', 6 + 7 * e);
        }
      }
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  }

  function aplicarEu() {
    const filtro = ['==', ['get', 'codIbge'], codEu ?? -1];
    mapa.setFilter('eu-brilho', filtro);
    mapa.setFilter('eu-linha', filtro);
  }

  const limites = (m) => [[m.caixa[0], m.caixa[1]], [m.caixa[2], m.caixa[3]]];

  return {
    pintar,
    selecionar(cod) {
      cartaoAberto = cod !== null;
      codSelecionado = cod;
      if (pronto) mapa.setFilter('selecionado', ['==', ['get', 'codIbge'], cod ?? -1]);
    },
    voarPara(cod) {
      const m = dados.porCodigo.get(cod);
      mapa.fitBounds(limites(m), {
        padding: margens(true),
        maxZoom: 10,
        duration: REDUZIR_MOVIMENTO ? 0 : 1300,
        pitch: relevoLigado ? INCLINACAO : 0,
        bearing: relevoLigado ? -8 : 0,
      });
    },
    faixaZoom: () => ({ min: mapa.getMinZoom(), max: mapa.getMaxZoom() }),
    definirZoom: (z) => mapa.jumpTo({ zoom: z }),
    enquadrar({ animar = true } = {}) {
      const cam = mapa.cameraForBounds(LIMITES_RS, { padding: margens(cartaoAberto) });
      mapa.easeTo({
        center: cam.center,
        zoom: cam.zoom,
        duration: REDUZIR_MOVIMENTO || !animar ? 0 : 1000,
        pitch: relevoLigado ? INCLINACAO : 0,
        bearing: relevoLigado ? -8 : 0,
      });
    },
    destacarEu(cod) {
      codEu = cod;
      if (pronto) aplicarEu();
    },
    marcarLocal([lon, lat]) {
      marcadorLocal?.remove();
      const el = document.createElement('div');
      el.className = 'eu';
      el.title = 'Você está aqui';
      marcadorLocal = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(mapa);
    },
    alternarRelevo() {
      relevoLigado = !relevoLigado;
      if (pronto) inclinar(relevoLigado);
      return relevoLigado;
    },
  };
}
