require([
  "esri/Map",
  "esri/views/MapView",
  "esri/widgets/Sketch",
  "esri/layers/GraphicsLayer",
  "esri/layers/FeatureLayer",
  "esri/layers/GeoJSONLayer",
  "esri/Graphic",
  "esri/geometry/Polygon",
  "esri/geometry/geometryEngine",
  "esri/geometry/projection",
  "esri/geometry/SpatialReference",
  "esri/widgets/Legend",
  "esri/widgets/LayerList",
], (
  Map,
  MapView,
  Sketch,
  GraphicsLayer,
  FeatureLayer,
  GeoJSONLayer,
  Graphic,
  Polygon,
  geometryEngine,
  projection,
  SpatialReference,
  Legend,
  LayerList,
) => {
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

  const map = new Map({ basemap: "hybrid", layers: [geojsonLayer, gridCellsLayer, unionLayer, sketchLayer] });

  const view = new MapView({ container: "viewDiv", map: map, center: [-47.9151, -15.6094], zoom: 14 });

  const legend = new Legend({ view: view });

  const layerList = new LayerList({ view: view, visibilityAppearance: "checkbox" });

  const sketch = new Sketch({
    layer: sketchLayer,
    view: view,
    creationMode: "single",
    availableCreateTools: ["polygon", "rectangle", "circle"],
    tooltipOptions: { enabled: true },
    visibleElements: { selectionTools: { "rectangle-selection": false, "lasso-selection": false } },
  });

  view.ui.add(sketch, "bottom-left");
  view.ui.add(legend, "bottom-right");
  view.ui.add(layerList, "top-right");
  view.ui.remove("zoom");

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
      wgs84Polygon = projection.project(polygon, new SpatialReference({ wkid: 4326 }));
    }

    const drawnVertexCount = polygon.rings.reduce((sum, ring) => sum + ring.length - 1, 0);
    document.getElementById("drawnVertices").textContent = drawnVertexCount;

    const drawnArea = geometryEngine.geodesicArea(polygon, "hectares").toFixed(2);
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

          if (geometryEngine.intersects(cell, wgs84Polygon)) {
            cells.push(cell);

            let displayCell = cell;
            if (view.spatialReference.wkid !== 4326) {
              displayCell = projection.project(cell, view.spatialReference);
            }

            let restricao = null;
            for (const feature of restrictionFeatures) {
              let featureGeom = feature.geometry;
              if (featureGeom.spatialReference.wkid !== 4326) {
                featureGeom = projection.project(featureGeom, new SpatialReference({ wkid: 4326 }));
              }

              if (geometryEngine.intersects(cell, featureGeom)) {
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
          let unionedGrid = geometryEngine.union(allowedCells);
          if (view.spatialReference.wkid !== 4326) {
            unionedGrid = projection.project(unionedGrid, view.spatialReference);
          }

          const dissolvedGrid = geometryEngine.generalize(unionedGrid, 0.00001, true);
          const unionVertexCount = dissolvedGrid.rings.reduce((sum, ring) => sum + ring.length - 1, 0);
          const unionArea = geometryEngine.geodesicArea(unionedGrid, "hectares").toFixed(2);

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

  projection.load().then(() => {
    sketch.on("create", (event) => {
      if (event.state === "complete") {
        const drawnPolygon = event.graphic.geometry;
        setTimeout(() => processPolygon(drawnPolygon), 100);
      }
    });
  });
});
