// =============================================================================
// Imports — operadores de geometria que usam WebAssembly precisam de .load()
// =============================================================================
const [
  GraphicsLayer,
  FeatureLayer,
  GeoJSONLayer,
  Graphic,
  Polygon,
  Polyline,
  intersectsOperator,
  unionOperator,
  geodeticAreaOperator,
  generalizeOperator,
  projectOperator,
  SpatialReference,
  reactiveUtils,
] = await $arcgis.import([
  "@arcgis/core/layers/GraphicsLayer.js",
  "@arcgis/core/layers/FeatureLayer.js",
  "@arcgis/core/layers/GeoJSONLayer.js",
  "@arcgis/core/Graphic.js",
  "@arcgis/core/geometry/Polygon.js",
  "@arcgis/core/geometry/Polyline.js",
  "@arcgis/core/geometry/operators/intersectsOperator.js",
  "@arcgis/core/geometry/operators/unionOperator.js",
  "@arcgis/core/geometry/operators/geodeticAreaOperator.js",
  "@arcgis/core/geometry/operators/generalizeOperator.js",
  "@arcgis/core/geometry/operators/projectOperator.js",
  "@arcgis/core/geometry/SpatialReference.js",
  "@arcgis/core/core/reactiveUtils.js",
]);

await projectOperator.load();
await geodeticAreaOperator.load();

// =============================================================================
// Referências aos elementos do DOM
// =============================================================================
const viewElement  = document.querySelector("arcgis-map");
const arcgisSketch = document.querySelector("arcgis-sketch");
const arcgisEditor = document.querySelector("arcgis-editor");

arcgisSketch.tooltipOptions.enabled = true;

await viewElement.viewOnReady();
const view = viewElement.view;
const WGS84 = SpatialReference.WGS84;

// =============================================================================
// Graticule WGS84 (1 arcsec x 1 arcsec) — só visível a partir do zoom 16
// =============================================================================
const graticuleLayer = new GraphicsLayer({ title: "Grid de Quadrículas", listMode: "show" });

const graticuleLineSymbol = { type: "simple-line", color: [50, 50, 50, 0.6], width: 0.5 };

function updateGraticule() {
  if (!view.stationary) return;
  graticuleLayer.removeAll();
  if (view.zoom < 16) return;

  const extWgs = projectOperator.execute(view.extent, WGS84);
  if (!extWgs) return;

  const interval = 1 / 3600; // 1 segundo de grau
  const graphics = [];

  const minLon = Math.ceil(extWgs.xmin  / interval) * interval;
  const maxLon = Math.floor(extWgs.xmax / interval) * interval;
  const minLat = Math.ceil(extWgs.ymin  / interval) * interval;
  const maxLat = Math.floor(extWgs.ymax / interval) * interval;

  for (let lon = minLon; lon <= maxLon; lon += interval) {
    const line = new Polyline({ paths: [[[lon, extWgs.ymin], [lon, extWgs.ymax]]], spatialReference: WGS84 });
    graphics.push(new Graphic({ geometry: line, symbol: graticuleLineSymbol }));
  }

  for (let lat = minLat; lat <= maxLat; lat += interval) {
    const line = new Polyline({ paths: [[[extWgs.xmin, lat], [extWgs.xmax, lat]]], spatialReference: WGS84 });
    graphics.push(new Graphic({ geometry: line, symbol: graticuleLineSymbol }));
  }

  graticuleLayer.addMany(graphics);
}

reactiveUtils.watch(() => view.stationary, (isStationary) => { if (isStationary) updateGraticule(); });
updateGraticule();

// =============================================================================
// Camadas
// =============================================================================

// Areas com restricoes (GeoJSON) — unica camada editavel pelo arcgis-editor
const geojsonLayer = new GeoJSONLayer({
  url: "data/dados.geojson",
  title: "Áreas exemplo",
  editingEnabled: true,
  fields: [
    { name: "ObjectID", type: "oid" },
    { name: "nome", type: "string", alias: "Nome" },
    {
      name: "Tipo", type: "string", alias: "Tipo",
      domain: {
        type: "coded-value",
        codedValues: [
          { code: "UC Integral",        name: "UC Integral" },
          { code: "UC Sustentável",     name: "UC Sustentável" },
          { code: "Concessão de Lavra", name: "Concessão de Lavra" },
          { code: "Área de Bloqueio",   name: "Área de Bloqueio" },
          { code: "Terra Indígena",     name: "Terra Indígena" },
        ],
      },
    },
    {
      name: "restricao", type: "string", alias: "Restrição",
      domain: {
        type: "coded-value",
        codedValues: [
          { code: "total",   name: "Total" },
          { code: "parcial", name: "Parcial" },
          { code: "",        name: "Nenhuma" },
        ],
      },
    },
  ],
  // Formulário do editor: só expõe campos relevantes ao usuário
  formTemplate: {
    elements: [
      { type: "field", fieldName: "nome",      label: "Nome" },
      { type: "field", fieldName: "Tipo",      label: "Tipo" },
      { type: "field", fieldName: "restricao", label: "Restrição" },
    ],
  },
  renderer: {
    type: "unique-value",
    field: "Tipo", // campo com T maiúsculo conforme definido no GeoJSON
    uniqueValueInfos: [
      { value: "UC Integral",        symbol: { type: "simple-fill", color: [0, 100, 13, 0.5],  outline: { color: [0, 100, 13],  width: 2 } } },
      { value: "UC Sustentável",     symbol: { type: "simple-fill", color: [0, 216, 29, 0.5],  outline: { color: [0, 216, 29],  width: 2 } } },
      { value: "Concessão de Lavra", symbol: { type: "simple-fill", color: [255, 0, 0, 0.5],   outline: { color: [255, 0, 0],   width: 2 } } },
      { value: "Área de Bloqueio",   symbol: { type: "simple-fill", color: [255, 0, 255, 0.5], outline: { color: [255, 0, 255], width: 2 } } },
      { value: "Terra Indígena",     symbol: { type: "simple-fill", color: [255, 255, 0, 0.5], outline: { color: [255, 255, 0], width: 2 } } },
    ],
  },
});

// Quadrículas geradas — coloridas por nível de restrição
const gridCellsLayer = new FeatureLayer({
  title: "Restrições",
  source: [],
  objectIdField: "ObjectID",
  geometryType: "polygon",
  fields: [
    { name: "ObjectID",  type: "oid" },
    { name: "cellId",    type: "string" },
    { name: "restricao", type: "string" },
  ],
  renderer: {
    type: "unique-value",
    field: "restricao",
    defaultLabel: "Sem restrição",
    defaultSymbol: { type: "simple-fill", color: [0, 255, 255, 0.2], outline: { color: [0, 255, 255, 0.2], width: 1 } },
    uniqueValueInfos: [
      { value: "total",   label: "Total",   symbol: { type: "simple-fill", color: [0, 0, 0, 0.4],     outline: { color: [0, 0, 0],     width: 1 } } },
      { value: "parcial", label: "Parcial", symbol: { type: "simple-fill", color: [255, 100, 0, 0.4], outline: { color: [255, 165, 0], width: 1 } } },
    ],
  },
});

// União das quadrículas sem restrição total — polígono final sugerido
const unionLayer = new FeatureLayer({
  title: "Polígono sugerido",
  source: [],
  objectIdField: "ObjectID",
  geometryType: "polygon",
  fields: [
    { name: "ObjectID",  type: "oid" },
    { name: "cellCount", type: "integer" },
  ],
  renderer: {
    type: "simple",
    symbol: { type: "simple-fill", color: [0, 255, 255, 0], outline: { color: [0, 255, 255], width: 2 } },
  },
});

// Camada temporária para o polígono sendo desenhado pelo Sketch
const sketchLayer = new GraphicsLayer({ title: "Polígono desenhado" });

// Ordem das camadas: GeoJSON na base, graticule acima, depois análise, sketch no topo
viewElement.map.addMany([geojsonLayer, graticuleLayer, gridCellsLayer, unionLayer, sketchLayer]);

// =============================================================================
// Configuração do Sketch
// =============================================================================
arcgisSketch.layer = sketchLayer;
arcgisSketch.polygonSymbol = {
  type: "simple-fill",
  color: [255, 255, 255, 0.2],
  outline: { color: [255, 255, 255, 1], width: 2, style: "dash" },
};

// =============================================================================
// Configuração do Editor — somente geojsonLayer é editável
// =============================================================================
arcgisEditor.layerInfos = [
  { layer: geojsonLayer,   enabled: true  },
  { layer: graticuleLayer, enabled: false },
  { layer: gridCellsLayer, enabled: false },
  { layer: unionLayer,     enabled: false },
  { layer: sketchLayer,    enabled: false },
];

// =============================================================================
// Controles da UI
// =============================================================================
function setStat(id, value) {
  document.getElementById(id).textContent = value;
}

function resetStats() {
  ["drawnVertices", "unionVertices", "totalCells", "allowedCells", "drawnArea", "unionArea"]
    .forEach((id) => setStat(id, 0));
}

document.getElementById("clearBtn").onclick = () => {
  sketchLayer.removeAll();
  gridCellsLayer.queryFeatures().then((r) => gridCellsLayer.applyEdits({ deleteFeatures: r.features }));
  unionLayer.queryFeatures().then((r) => unionLayer.applyEdits({ deleteFeatures: r.features }));
  resetStats();
};

// =============================================================================
// Processamento do grid de quadrículas
// =============================================================================
let objectIdCounter = 1;

function processPolygon(polygon) {
  // Garante que o polígono de entrada esteja em WGS84 para os cálculos
  const wgs84Polygon = polygon.spatialReference.wkid === 4326
    ? polygon
    : projectOperator.execute(polygon, WGS84);

  // Estatísticas do polígono desenhado
  setStat("drawnVertices", polygon.rings.reduce((sum, ring) => sum + ring.length - 1, 0));
  setStat("drawnArea", `${geodeticAreaOperator.execute(polygon, { unit: "hectares" }).toFixed(2)} ha`);

  // Calcula o bounding box alinhado à grade de 1 arcsec
  const gridSize = 1 / 3600;
  const { xmin, xmax, ymin, ymax } = wgs84Polygon.extent;

  const minX = Math.floor(xmin / gridSize) * gridSize;
  const maxX = Math.ceil(xmax  / gridSize) * gridSize;
  const minY = Math.floor(ymin / gridSize) * gridSize;
  const maxY = Math.ceil(ymax  / gridSize) * gridSize;

  const numCellsX = Math.round((maxX - minX) / gridSize);
  const numCellsY = Math.round((maxY - minY) / gridSize);

  if (numCellsX * numCellsY > 10000) {
    alert(`Número de quadrículas muito grande (${numCellsX * numCellsY}), desenhe um polígono menor.`);
    return;
  }

  geojsonLayer.queryFeatures().then((geojsonResult) => {
    const viewSR = view.spatialReference;

    // Pré-projeta as geometrias de restrição para WGS84 uma única vez,
    // evitando reprojeções repetidas dentro do loop de células (O(n) vs O(n×m))
    const restrictionFeatures = geojsonResult.features.map((f) => ({
      restricao: f.attributes.restricao,
      geometry: f.geometry.spatialReference.wkid === 4326
        ? f.geometry
        : projectOperator.execute(f.geometry, WGS84),
    }));

    const cells = [];        // geometrias WGS84 para operações de análise
    const cellFeatures = []; // features prontas para inserção no gridCellsLayer

    for (let i = 0; i < numCellsX; i++) {
      for (let j = 0; j < numCellsY; j++) {
        const x = minX + i * gridSize;
        const y = minY + j * gridSize;

        const cell = new Polygon({
          rings: [[[x, y], [x + gridSize, y], [x + gridSize, y + gridSize], [x, y + gridSize], [x, y]]],
          spatialReference: WGS84,
        });

        if (!intersectsOperator.execute(cell, wgs84Polygon)) continue;

        // Determina o nível de restrição da célula (total > parcial > nenhuma)
        let restricao = null;
        for (const { restricao: r, geometry } of restrictionFeatures) {
          if (!intersectsOperator.execute(cell, geometry)) continue;
          if (r === "total")  { restricao = "total"; break; }
          if (r === "parcial")  restricao = "parcial";
        }

        cells.push(cell);

        // Projeta para o SR do mapa apenas para exibição no gridCellsLayer
        const displayCell = viewSR.wkid === 4326
          ? cell
          : projectOperator.execute(cell, viewSR);

        cellFeatures.push({
          geometry: displayCell,
          attributes: { ObjectID: objectIdCounter++, cellId: `cell_${i}_${j}`, restricao },
        });
      }
    }

    setStat("totalCells", cells.length);

    if (cells.length === 0) {
      setStat("allowedCells", 0);
      setStat("unionVertices", 0);
      setStat("unionArea", 0);
      return;
    }

    gridCellsLayer.applyEdits({ addFeatures: cellFeatures });

    // Células sem restrição total formam o polígono sugerido
    const allowedCells = cells.filter((_, i) => cellFeatures[i].attributes.restricao !== "total");
    setStat("allowedCells", allowedCells.length);

    if (allowedCells.length === 0) {
      setStat("unionVertices", 0);
      setStat("unionArea", 0);
      return;
    }

    let unionedGrid = unionOperator.executeMany(allowedCells);

    // Área calculada em WGS84 antes de reprojetar para exibição
    setStat("unionArea", `${geodeticAreaOperator.execute(unionedGrid, { unit: "hectares" }).toFixed(2)} ha`);

    if (viewSR.wkid !== 4326) {
      unionedGrid = projectOperator.execute(unionedGrid, viewSR);
    }

    // Generalização para reduzir vértices redundantes nas bordas do grid
    const dissolvedGrid = generalizeOperator.execute(unionedGrid, 0.00001, true);
    setStat("unionVertices", dissolvedGrid.rings.reduce((sum, ring) => sum + ring.length - 1, 0));

    unionLayer.applyEdits({
      addFeatures: [{ geometry: unionedGrid, attributes: { ObjectID: objectIdCounter++, cellCount: allowedCells.length } }],
    });
  });
}

arcgisSketch.addEventListener("arcgisCreate", (event) => {
  if (event.detail.state === "complete") {
    // Pequeno delay para garantir que o sketch finalizou o render antes de processar
    setTimeout(() => processPolygon(event.detail.graphic.geometry), 100);
  }
});
