// Mapa de chuva acumulada por município do RS.
// Valor do município = maior acumulado entre as estações ativas dele.

// Chuva em azul → roxo, para não se confundir com as cores de situação dos rios (verde/amarelo/laranja/vermelho).
const FAIXAS = [
  { ate: 0, cor: '#eef4fb', rotulo: 'sem chuva' },
  { ate: 10, cor: '#c6dbef', rotulo: 'até 10 mm' },
  { ate: 30, cor: '#8cb8e0', rotulo: '10 a 30 mm' },
  { ate: 60, cor: '#4a86c5', rotulo: '30 a 60 mm' },
  { ate: 100, cor: '#2a56a0', rotulo: '60 a 100 mm' },
  { ate: Infinity, cor: '#4b2a85', rotulo: 'mais de 100 mm' },
];

// Situação do nível do rio segundo a Defesa Civil RS.
const SITUACOES = [
  { valor: 0, cor: '#69a82f', rotulo: 'normalidade' },
  { valor: 1, cor: '#faba00', rotulo: 'atenção' },
  { valor: 2, cor: '#e67819', rotulo: 'alerta' },
  { valor: 3, cor: '#e20228', rotulo: 'inundação' },
];
const COR_SEM_LIMIAR = '#ffffff';
const LEITURA_RECENTE_MS = 30 * 60 * 1000;
const DADO_VELHO_MS = 60 * 60 * 1000; // o workflow roda a cada 15 min; passou disso, a coleta está falhando
const COR_SEM_DADO = getComputedStyle(document.documentElement).getPropertyValue('--sem-dado').trim() || '#cfd6dd';

const fmtMm = (v) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm`;
const fmtHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function faixaDe(valor) {
  return FAIXAS.find((f) => valor <= f.ate);
}

async function carregar(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// Os rios são opcionais: se a fonte falhar, o mapa de chuva continua funcionando.
const [chuva, malha, rios] = await Promise.all([
  carregar('data/chuva-rs.json'),
  carregar('data/municipios-rs.geojson'),
  carregar('data/rios-rs.json').catch(() => null),
]);

const textoSituacao = (e) => SITUACOES.find((s) => s.valor === e.situacao)?.rotulo ?? 'sem limiar cadastrado';

function pontosRios() {
  if (!rios) return { type: 'FeatureCollection', features: [] };
  const agora = Date.now();
  return {
    type: 'FeatureCollection',
    features: rios.estacoes.map((e) => {
      const recente = agora - Date.parse(e.ultimaLeitura) <= LEITURA_RECENTE_MS && !e.emManutencao;
      const sit = SITUACOES.find((s) => s.valor === e.situacao);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
        properties: { codigo: e.codigo, cor: recente && sit ? sit.cor : COR_SEM_LIMIAR },
      };
    }),
  };
}

// Pluviômetros das duas fontes, no mesmo formato. Nas duas há acumulados de 1h, 6h, 24h e 48h.
const estacoesPorMunicipio = new Map();
const adicionar = (e, fonte) => {
  if (!estacoesPorMunicipio.has(e.codIbge)) estacoesPorMunicipio.set(e.codIbge, []);
  estacoesPorMunicipio.get(e.codIbge).push({ ...e, fonte });
};
chuva.estacoes.forEach((e) => adicionar(e, 'CEMADEN'));
(rios?.pluviometros ?? []).forEach((e) => adicionar(e, 'Defesa Civil RS'));

let janela = '24h';

function valorDoMunicipio(codIbge, j) {
  const ativas = (estacoesPorMunicipio.get(codIbge) ?? []).filter((e) => e.ativa);
  if (ativas.length === 0) return null;
  return Math.max(...ativas.map((e) => e.acumuladoMm[j] ?? 0));
}

function pintarFeatures() {
  for (const f of malha.features) {
    const v = valorDoMunicipio(f.properties.codIbge, janela);
    f.properties.cor = v === null ? COR_SEM_DADO : faixaDe(v).cor;
  }
}

function legenda() {
  const itens = FAIXAS.map((f) => `<li><i style="background:${f.cor}"></i>${f.rotulo}</li>`);
  itens.push(`<li><i style="background:${COR_SEM_DADO}"></i>sem pluviômetro ativo</li>`);
  document.getElementById('legenda').innerHTML = itens.join('');

  if (!rios) return;
  const itensRio = SITUACOES.map((s) => `<li><i class="ponto" style="background:${s.cor}"></i>${s.rotulo}</li>`);
  itensRio.push(`<li><i class="ponto" style="background:${COR_SEM_LIMIAR}"></i>sem limiar ou sem leitura</li>`);
  document.getElementById('legenda-rios').innerHTML = `<li class="titulo">Rios (situação informada pela Defesa Civil):</li>${itensRio.join('')}`;
}

const fmtM = (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

function painelRio(codigo) {
  const e = rios.estacoes.find((r) => r.codigo === codigo);
  const el = document.getElementById('painel');
  const variacao = e.variacaoM === null ? '—' : `${e.variacaoM > 0 ? '+' : ''}${fmtM(e.variacaoM).replace(' m', '')} m`;
  const avisos = [];
  if (e.emManutencao) avisos.push('Estação em manutenção.');
  if (!e.sensorValido) avisos.push('Sensor com dado ainda não homologado.');
  el.innerHTML = `
    <h2>${e.nome}</h2>
    <p class="vazio">Estação de rio · ${e.bacia} · ${e.regiao}</p>
    <table>
      <tbody>
        <tr><td>Situação informada pela Defesa Civil</td><td><strong>${textoSituacao(e)}</strong></td></tr>
        <tr><td>Nível</td><td>${fmtM(e.nivelM)}</td></tr>
        <tr><td>Variação (vs. média da última hora)</td><td>${variacao}</td></tr>
        <tr><td>Chuva 1 h / 24 h / 7 dias</td><td>${['1h', '24h', '7d'].map((j) => (e.chuvaMm[j] === null ? '—' : fmtMm(e.chuvaMm[j]))).join(' / ')}</td></tr>
        <tr><td>Última leitura</td><td>${fmtHora(e.ultimaLeitura)}</td></tr>
      </tbody>
    </table>
    ${avisos.map((a) => `<p class="vazio">${a}</p>`).join('')}
    <p class="vazio">A situação é a classificação da Defesa Civil e pode refletir o maior nível recente, não só o atual. Confira os alertas oficiais. Fonte: Rede Hidrometeorológica da Defesa Civil do RS.</p>`;
}

function cobertura() {
  const cobertos = malha.features.filter((f) => valorDoMunicipio(f.properties.codIbge, janela) !== null).length;
  document.getElementById('cobertura').textContent =
    `${cobertos} de ${malha.features.length} municípios têm pelo menos um pluviômetro ativo (CEMADEN ou Defesa Civil RS).`;
}

function painel(codIbge, nome) {
  const el = document.getElementById('painel');
  const ativas = (estacoesPorMunicipio.get(codIbge) ?? []).filter((e) => e.ativa);
  if (ativas.length === 0) {
    el.innerHTML = `<h2>${nome}</h2><p class="vazio">Sem pluviômetro ativo neste município. Isso não significa que não está chovendo.</p>`;
    return;
  }
  const linhas = ativas
    .map(
      (e) => `<tr>
        <td>${e.nome}<br><small class="fonte">${e.fonte}</small></td>
        <td>${fmtMm(e.acumuladoMm['1h'])}</td>
        <td>${fmtMm(e.acumuladoMm['24h'])}</td>
        <td>${fmtMm(e.acumuladoMm['48h'])}</td>
      </tr>`,
    )
    .join('');
  const ultima = ativas.map((e) => e.ultimaLeitura).sort().at(-1);
  el.innerHTML = `
    <h2>${nome}</h2>
    <p class="vazio">${ativas.length} estação(ões) ativa(s). Última leitura: ${fmtHora(ultima)}.</p>
    <table>
      <thead><tr><th>Estação</th><th>1 h</th><th>24 h</th><th>48 h</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

pintarFeatures();
legenda();
cobertura();
document.getElementById('atualizado').textContent =
  `Chuva do CEMADEN coletada em ${fmtHora(chuva.geradoEm)}` +
  (rios ? `; Defesa Civil RS (chuva e rios) em ${fmtHora(rios.geradoEm)}.` : '; dados da Defesa Civil RS indisponíveis no momento.');

const velhos = [
  ['chuva', chuva.geradoEm],
  ...(rios ? [['rios', rios.geradoEm]] : []),
].filter(([, quando]) => Date.now() - Date.parse(quando) > DADO_VELHO_MS);
if (velhos.length) {
  const aviso = document.getElementById('aviso-dados');
  aviso.hidden = false;
  aviso.textContent =
    `Atenção: os dados de ${velhos.map(([nome]) => nome).join(' e ')} estão desatualizados (a fonte está ` +
    'instável). O que aparece abaixo pode não refletir a situação atual. Consulte a Defesa Civil.';
}

const mapa = new maplibregl.Map({
  container: 'mapa',
  style: { version: 8, sources: {}, layers: [{ id: 'fundo', type: 'background', paint: { 'background-color': 'transparent' } }] },
  bounds: [[-57.7, -33.8], [-49.6, -27.0]],
  fitBoundsOptions: { padding: 10 },
  attributionControl: false,
});

mapa.on('load', () => {
  mapa.addSource('municipios', { type: 'geojson', data: malha, promoteId: 'codIbge' });
  mapa.addLayer({ id: 'preenchimento', type: 'fill', source: 'municipios', paint: { 'fill-color': ['get', 'cor'] } });
  mapa.addLayer({
    id: 'contorno',
    type: 'line',
    source: 'municipios',
    paint: { 'line-color': '#ffffff', 'line-width': 0.5, 'line-opacity': 0.8 },
  });
  mapa.addLayer({
    id: 'selecionado',
    type: 'line',
    source: 'municipios',
    filter: ['==', ['get', 'codIbge'], -1],
    paint: { 'line-color': '#1b2733', 'line-width': 2.5 },
  });

  mapa.addSource('rios', { type: 'geojson', data: pontosRios() });
  mapa.addLayer({
    id: 'rios',
    type: 'circle',
    source: 'rios',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 8],
      'circle-color': ['get', 'cor'],
      'circle-stroke-color': '#1b2733',
      'circle-stroke-width': 1.5,
    },
  });

  // Estação de rio tem prioridade sobre o município embaixo dela. A área de toque é maior que o ponto.
  mapa.on('click', (ev) => {
    const { x, y } = ev.point;
    const margem = 10;
    const [rio] = mapa.queryRenderedFeatures([[x - margem, y - margem], [x + margem, y + margem]], { layers: ['rios'] });
    if (rio) {
      mapa.setFilter('selecionado', ['==', ['get', 'codIbge'], -1]);
      painelRio(rio.properties.codigo);
      return;
    }
    const [muni] = mapa.queryRenderedFeatures(ev.point, { layers: ['preenchimento'] });
    if (!muni) return;
    mapa.setFilter('selecionado', ['==', ['get', 'codIbge'], muni.properties.codIbge]);
    painel(muni.properties.codIbge, muni.properties.nome);
  });
  mapa.on('mousemove', (ev) => {
    const alvo = mapa.queryRenderedFeatures(ev.point, { layers: ['rios', 'preenchimento'] });
    mapa.getCanvas().style.cursor = alvo.length ? 'pointer' : '';
  });
});

document.getElementById('janelas').addEventListener('click', (ev) => {
  const botao = ev.target.closest('button[data-janela]');
  if (!botao) return;
  janela = botao.dataset.janela;
  document.querySelectorAll('#janelas button').forEach((b) => b.classList.toggle('ativo', b === botao));
  pintarFeatures();
  cobertura();
  mapa.getSource('municipios')?.setData(malha);
});
