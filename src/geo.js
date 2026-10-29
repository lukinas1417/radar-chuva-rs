// Geometria sobre a malha municipal do IBGE. Sem dependências: roda no navegador e no Node.

function dentroDoAnel([x, y], anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const dentroDoPoligono = (ponto, [externo, ...buracos]) =>
  dentroDoAnel(ponto, externo) && !buracos.some((b) => dentroDoAnel(ponto, b));

const poligonos = ({ type, coordinates }) => (type === 'Polygon' ? [coordinates] : coordinates);

// [oeste, sul, leste, norte]
function caixaDe(geometria) {
  let [oeste, sul, leste, norte] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poligono of poligonos(geometria)) {
    for (const [x, y] of poligono[0]) {
      if (x < oeste) oeste = x;
      if (x > leste) leste = x;
      if (y < sul) sul = y;
      if (y > norte) norte = y;
    }
  }
  return [oeste, sul, leste, norte];
}

// Lista de municípios com caixa delimitadora, para consultas rápidas.
export function indexarMunicipios(malha) {
  return malha.features.map((f) => {
    const caixa = caixaDe(f.geometry);
    return {
      codIbge: f.properties.codIbge,
      nome: f.properties.nome,
      geometria: f.geometry,
      caixa,
      centro: [(caixa[0] + caixa[2]) / 2, (caixa[1] + caixa[3]) / 2],
    };
  });
}

export function municipioDe(indice, lon, lat) {
  for (const m of indice) {
    const [oeste, sul, leste, norte] = m.caixa;
    if (lon < oeste || lon > leste || lat < sul || lat > norte) continue;
    if (poligonos(m.geometria).some((p) => dentroDoPoligono([lon, lat], p))) return m;
  }
  return null;
}

// Distância aproximada em km entre dois pontos [lon, lat] (haversine).
export function distanciaKm([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// Área aproximada (km²) de um Polygon ou MultiPolygon em graus. Projeção local simples (por parte): serve para proporção, não para cadastro.
export function areaKm2(geometria) {
  const areaDoPoligono = ([externo, ...buracos]) => {
    const latMedia = externo.reduce((s, [, y]) => s + y, 0) / externo.length;
    const kx = 111.32 * Math.cos((latMedia * Math.PI) / 180);
    const ky = 110.57;
    const anel = (pontos) => {
      let soma = 0;
      for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
        soma += pontos[j][0] * kx * (pontos[i][1] * ky) - pontos[i][0] * kx * (pontos[j][1] * ky);
      }
      return Math.abs(soma) / 2;
    };
    return anel(externo) - buracos.reduce((s, b) => s + anel(b), 0);
  };
  return poligonos(geometria).reduce((total, p) => total + areaDoPoligono(p), 0);
}
