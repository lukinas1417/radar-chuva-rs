// Mapa de chuva acumulada por município do RS.
// Valor do município = maior acumulado entre as estações ativas dele.

const FAIXAS = [
  { ate: 0, cor: '#e8f1fb', rotulo: 'sem chuva' },
  { ate: 10, cor: '#9ecae1', rotulo: 'até 10 mm' },
  { ate: 30, cor: '#4a9fd8', rotulo: '10 a 30 mm' },
  { ate: 60, cor: '#f2c14e', rotulo: '30 a 60 mm' },
  { ate: 100, cor: '#e8743b', rotulo: '60 a 100 mm' },
  { ate: Infinity, cor: '#b3262f', rotulo: 'mais de 100 mm' },
];
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

const [chuva, malha] = await Promise.all([carregar('data/chuva-rs.json'), carregar('data/municipios-rs.geojson')]);

const estacoesPorMunicipio = new Map();
for (const e of chuva.estacoes) {
  if (!estacoesPorMunicipio.has(e.codIbge)) estacoesPorMunicipio.set(e.codIbge, []);
  estacoesPorMunicipio.get(e.codIbge).push(e);
}

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
}

function cobertura() {
  const cobertos = malha.features.filter((f) => valorDoMunicipio(f.properties.codIbge, janela) !== null).length;
  document.getElementById('cobertura').textContent =
    `${cobertos} de ${malha.features.length} municípios têm pelo menos um pluviômetro ativo do CEMADEN.`;
}

function painel(codIbge, nome) {
  const el = document.getElementById('painel');
  const ativas = (estacoesPorMunicipio.get(codIbge) ?? []).filter((e) => e.ativa);
  if (ativas.length === 0) {
    el.innerHTML = `<h2>${nome}</h2><p class="vazio">Sem pluviômetro ativo do CEMADEN neste município. Isso não significa que não está chovendo.</p>`;
    return;
  }
  const linhas = ativas
    .map(
      (e) => `<tr>
        <td>${e.nome}</td>
        <td>${fmtMm(e.acumuladoMm['1h'])}</td>
        <td>${fmtMm(e.acumuladoMm['24h'])}</td>
        <td>${fmtMm(e.acumuladoMm['72h'])}</td>
      </tr>`,
    )
    .join('');
  const ultima = ativas.map((e) => e.ultimaLeitura).sort().at(-1);
  el.innerHTML = `
    <h2>${nome}</h2>
    <p class="vazio">${ativas.length} estação(ões) ativa(s). Última leitura: ${fmtHora(ultima)}.</p>
    <table>
      <thead><tr><th>Estação</th><th>1 h</th><th>24 h</th><th>72 h</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

pintarFeatures();
legenda();
cobertura();
document.getElementById('atualizado').textContent =
  `Dados do CEMADEN coletados em ${fmtHora(chuva.geradoEm)}. Em geral, as leituras têm poucos minutos de atraso.`;

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

  mapa.on('click', 'preenchimento', (ev) => {
    const { codIbge, nome } = ev.features[0].properties;
    mapa.setFilter('selecionado', ['==', ['get', 'codIbge'], codIbge]);
    painel(codIbge, nome);
  });
  mapa.on('mouseenter', 'preenchimento', () => (mapa.getCanvas().style.cursor = 'pointer'));
  mapa.on('mouseleave', 'preenchimento', () => (mapa.getCanvas().style.cursor = ''));
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
