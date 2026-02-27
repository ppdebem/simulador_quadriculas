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

const viewElement = document.querySelector("arcgis-map");
const arcgisSketch = document.querySelector("arcgis-sketch");

await viewElement.viewOnReady();
const view = viewElement.view;

// --- Graticule WGS84 ---
const graticuleLayer = new GraphicsLayer({ title: "Grid de Quadrículas", listMode: "show" });

const lineSymbol = { type: "simple-line", color: [50, 50, 50, 0.8], width: 0.5 };

function updateGraticule() {
  if (!view.stationary) return;
  graticuleLayer.removeAll();

  if (view.zoom < 15) return; // só mostra em zoom alto

  const ext = view.extent;
  const wgs84 = SpatialReference.WGS84;
  const extWgs = projectOperator.execute(ext, wgs84);
  if (!extWgs) return;

  const interval = 1 / 3600; // 1 arcsec
  const graphics = [];

  const minLon = Math.ceil(extWgs.xmin / interval) * interval;
  const maxLon = Math.floor(extWgs.xmax / interval) * interval;
  const minLat = Math.ceil(extWgs.ymin / interval) * interval;
  const maxLat = Math.floor(extWgs.ymax / interval) * interval;

  for (let lon = minLon; lon <= maxLon + 1e-9; lon += interval) {
    const line = new Polyline({ paths: [[[lon, extWgs.ymin], [lon, extWgs.ymax]]], spatialReference: wgs84 });
    graphics.push(new Graphic({ geometry: line, symbol: lineSymbol}));
  }

  for (let lat = minLat; lat <= maxLat + 1e-9; lat += interval) {
    const line = new Polyline({ paths: [[[extWgs.xmin, lat], [extWgs.xmax, lat]]], spatialReference: wgs84 });
    graphics.push(new Graphic({ geometry: line, symbol: lineSymbol}));
  }

  graticuleLayer.addMany(graphics);
}

reactiveUtils.watch(() => view.stationary, (isStationary) => { if (isStationary) updateGraticule(); });
updateGraticule();
// --- fim Graticule ---

{
  const unionLayer = new FeatureLayer({
    title: "Polígono sugerido",
    source: [],
    objectIdField: "ObjectID",
    geometryType: "polygon",
    fields: [
      { name: "ObjectID", type: "oid" },
      { name: "cellCount", type: "integer" },
    ],
    renderer: {
      type: "simple",
      symbol: { type: "simple-fill", color: [0, 255, 255, 0], outline: { color: [0, 255, 255], width: 2 } },
    },
  });

  const geojsonLayer = new GeoJSONLayer({
    url: "data/dados.geojson",
    title: "Áreas exemplo",
    renderer: {
      type: "unique-value",
      field: "tipo",
      uniqueValueInfos: [
        {
          value: "UC Integral",
          symbol: { type: "simple-fill", color: [0, 100, 13, 0.5], outline: { color: [0, 100, 13], width: 2 } },
        },
        {
          value: "UC Sustentável",
          symbol: { type: "simple-fill", color: [0, 216, 29, 0.5], outline: { color: [0, 216, 29], width: 2 } },
        },
        {
          value: "Concessão de Lavra",
          symbol: { type: "simple-fill", color: [255, 0, 0, 0.5], outline: { color: [255, 0, 0], width: 2 } },
        },
        {
          value: "Área de Bloqueio",
          symbol: { type: "simple-fill", color: [255, 0, 255, 0.5], outline: { color: [255, 0, 255], width: 2 } },
        },
      ],
    },
  });

  const sketchLayer = new GraphicsLayer({ title: "Polígono desenhado" });

  const gridCellsLayer = new FeatureLayer({
    title: "Restrições",
    source: [],
    objectIdField: "ObjectID",
    geometryType: "polygon",
    fields: [
      { name: "ObjectID", type: "oid" },
      { name: "cellId", type: "string" },
      { name: "restricao", type: "string" },
    ],
    renderer: {
      type: "unique-value",
      field: "restricao",
      defaultLabel: "Sem restrição",
      defaultSymbol: {
        type: "simple-fill",
        color: [0, 255, 255, 0.2],
        outline: { color: [0, 255, 255, 0.2], width: 1 },
      },
      uniqueValueInfos: [
        {
          value: "total",
          label: "Total",
          symbol: { type: "simple-fill", color: [0, 0, 0, 0.4], outline: { color: [0, 0, 0], width: 1 } },
        },
        {
          value: "parcial",
          label: "Parcial",
          symbol: { type: "simple-fill", color: [255, 165, 0, 0.4], outline: { color: [255, 165, 0], width: 1 } },
        },
      ],
    },
  });

  geojsonLayer.when(
    () => {
      console.log("GeoJSON loaded successfully");
      console.log("Feature count:", geojsonLayer.source.length);
    },
    (error) => {
      console.error("GeoJSON load error:", error);
    },
  );

  viewElement.map.addMany([geojsonLayer, graticuleLayer, gridCellsLayer, unionLayer, sketchLayer]);
  arcgisSketch.layer = sketchLayer;



  document.getElementById("clearBtn").onclick = () => {
    sketchLayer.removeAll();
    gridCellsLayer.queryFeatures().then((result) => {
      gridCellsLayer.applyEdits({ deleteFeatures: result.features });
    });
    unionLayer.queryFeatures().then((result) => {
      unionLayer.applyEdits({ deleteFeatures: result.features });
    });
    document.getElementById("drawnVertices").textContent = 0;
    document.getElementById("totalCells").textContent = 0;
    document.getElementById("allowedCells").textContent = 0;
    document.getElementById("unionVertices").textContent = 0;
    document.getElementById("drawnArea").textContent = 0;
    document.getElementById("unionArea").textContent = 0;
  };

  let objectIdCounter = 1;

  function processPolygon(polygon) {
    let wgs84Polygon = polygon;
    if (polygon.spatialReference.wkid !== 4326) {
      wgs84Polygon = projectOperator.execute(polygon, new SpatialReference({ wkid: 4326 }));
    }

    const drawnVertexCount = polygon.rings.reduce((sum, ring) => sum + ring.length - 1, 0);
    document.getElementById("drawnVertices").textContent = drawnVertexCount;

    const drawnArea = geodeticAreaOperator.execute(polygon, { unit: "hectares" }).toFixed(2);
    document.getElementById("drawnArea").textContent = `${drawnArea} ha`;

    const extent = wgs84Polygon.extent;
    const gridSize = 1 / 3600;

    const minX = Math.floor(extent.xmin / gridSize) * gridSize;
    const maxX = Math.ceil(extent.xmax / gridSize) * gridSize;
    const minY = Math.floor(extent.ymin / gridSize) * gridSize;
    const maxY = Math.ceil(extent.ymax / gridSize) * gridSize;

    const numCellsX = Math.round((maxX - minX) / gridSize);
    const numCellsY = Math.round((maxY - minY) / gridSize);
    const totalCells = numCellsX * numCellsY;

    console.log(`Grid: ${numCellsX} x ${numCellsY} = ${totalCells} cells`);

    if (totalCells > 10000) {
      alert(`Número de quadrículas muito grande (${totalCells}), desenhe um polígono menor.`);
      return;
    }

    geojsonLayer.queryFeatures().then((geojsonResult) => {
      const restrictionFeatures = geojsonResult.features;
      const cells = [];
      const cellFeatures = [];

      for (let i = 0; i < numCellsX; i++) {
        for (let j = 0; j < numCellsY; j++) {
          const x = minX + i * gridSize;
          const y = minY + j * gridSize;

          const cell = new Polygon({
            rings: [[[x, y], [x + gridSize, y], [x + gridSize, y + gridSize], [x, y + gridSize], [x, y]]],
            spatialReference: { wkid: 4326 },
          });

          if (intersectsOperator.execute(cell, wgs84Polygon)) {
            cells.push(cell);

            let displayCell = cell;
            if (viewElement.view.spatialReference.wkid !== 4326) {
              displayCell = projectOperator.execute(cell, viewElement.view.spatialReference);
            }

            let restricao = null;
            for (const feature of restrictionFeatures) {
              let featureGeom = feature.geometry;
              if (featureGeom.spatialReference.wkid !== 4326) {
                featureGeom = projectOperator.execute(featureGeom, new SpatialReference({ wkid: 4326 }));
              }

              if (intersectsOperator.execute(cell, featureGeom)) {
                const featureRestricao = feature.attributes.restricao;
                if (featureRestricao === "total") {
                  restricao = "total";
                  break;
                } else if (featureRestricao === "parcial" && restricao !== "total") {
                  restricao = "parcial";
                }
              }
            }

            cellFeatures.push({
              geometry: displayCell,
              attributes: { ObjectID: objectIdCounter++, cellId: `cell_${i}_${j}`, restricao: restricao },
            });
          }
        }
      }

      console.log(`Intersecting cells: ${cells.length}`);
      document.getElementById("totalCells").textContent = cells.length;

      if (cells.length > 0) {
        gridCellsLayer.applyEdits({ addFeatures: cellFeatures });

        const allowedCells = cells.filter((_, i) => cellFeatures[i].attributes.restricao !== "total");

        console.log(`Allowed cells (non-total): ${allowedCells.length}`);
        document.getElementById("allowedCells").textContent = allowedCells.length;

        if (allowedCells.length > 0) {
          let unionedGrid = unionOperator.executeMany(allowedCells);
          if (viewElement.view.spatialReference.wkid !== 4326) {
            unionedGrid = projectOperator.execute(unionedGrid, viewElement.view.spatialReference);
          }

          const dissolvedGrid = generalizeOperator.execute(unionedGrid, 0.00001, true);
          const unionVertexCount = dissolvedGrid.rings.reduce((sum, ring) => sum + ring.length - 1, 0);
          const unionArea = geodeticAreaOperator.execute(unionedGrid, { unit: "hectares" }).toFixed(2);

          document.getElementById("unionVertices").textContent = unionVertexCount;
          document.getElementById("unionArea").textContent = `${unionArea} ha`;

          unionLayer.applyEdits({
            addFeatures: [{
              geometry: unionedGrid,
              attributes: { ObjectID: objectIdCounter++, cellCount: allowedCells.length },
            }],
          });
        } else {
          document.getElementById("unionVertices").textContent = 0;
          document.getElementById("unionArea").textContent = 0;
        }
      } else {
        document.getElementById("allowedCells").textContent = 0;
        document.getElementById("unionVertices").textContent = 0;
        document.getElementById("unionArea").textContent = 0;
      }
    });
  }

  arcgisSketch.addEventListener("arcgisCreate", (event) => {
    if (event.detail.state === "complete") {
      const drawnPolygon = event.detail.graphic.geometry;
      setTimeout(() => processPolygon(drawnPolygon), 100);
    }
  });
}