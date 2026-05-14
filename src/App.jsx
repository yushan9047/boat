import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  ImageOverlay,
  CircleMarker,
  Tooltip,
  Popup,
  useMap,
} from "react-leaflet";
import {
  LAKE_CENTER,
  LAKE_POLYGON,
  MONITOR_POINTS,
  generateSensorData,
} from "./data/mockBoatData";

const COLOR_STOPS = [
  [0.0, [49, 130, 189]],
  [0.25, [171, 217, 233]],
  [0.5, [255, 255, 191]],
  [0.75, [253, 174, 97]],
  [1.0, [215, 25, 28]],
];

const METRIC_CONFIG = {
  co2: { label: "CO₂", unit: "ppm", decimal: 2 },
  ch4: { label: "CH₄", unit: "ppm", decimal: 4 },
  transparency: { label: "透明度", unit: "m", decimal: 2 },
  chlorophyllA: { label: "葉綠素 a", unit: "μg/L", decimal: 2 },
  totalPhosphorus: { label: "總磷", unit: "μg/L", decimal: 2 },
};

const BASE_URL = import.meta.env.BASE_URL;

function BoundsFitter() {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(LAKE_POLYGON, {
      padding: [80, 80],
    });
  }, [map]);

  return null;
}

export default function App() {
  const [metric, setMetric] = useState("co2");
  const [currentRound, setCurrentRound] = useState([]);
  const [completedData, setCompletedData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      const point = MONITOR_POINTS[currentIndex];
      const newData = generateSensorData(point);

      setCurrentRound((prev) => {
        const updated = [...prev, newData];

        if (updated.length === MONITOR_POINTS.length) {
          setCompletedData(updated);

          setTimeout(() => {
            setCurrentRound([]);
            setCurrentIndex(0);
            setRoundNumber((prevRound) => prevRound + 1);
          }, 800);
        }

        return updated;
      });

      setCurrentIndex((prev) => {
        if (prev + 1 >= MONITOR_POINTS.length) return prev;
        return prev + 1;
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [currentIndex, isRunning]);

  const displayData = completedData.length > 0 ? completedData : currentRound;

  const heatmapResult = useMemo(() => {
    if (displayData.length < MONITOR_POINTS.length) return null;
    return createInterpolatedLakeHeatmap(displayData, metric);
  }, [displayData, metric]);

  const metricInfo = METRIC_CONFIG[metric];
  const values = displayData.map((item) => item[metric]).filter((v) => typeof v === "number");

  const minValue = values.length ? Math.min(...values).toFixed(metricInfo.decimal) : "-";
  const maxValue = values.length ? Math.max(...values).toFixed(metricInfo.decimal) : "-";
  const avgValue = values.length
    ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(metricInfo.decimal)
    : "-";

  const statusText =
    currentRound.length === 0
      ? `第 ${roundNumber} 輪監測準備中`
      : currentRound.length < MONITOR_POINTS.length
      ? `第 ${roundNumber} 輪監測中：已收到 ${currentRound.length}/${MONITOR_POINTS.length} 點`
      : "十點資料已完成，正在更新論文式熱圖";

  return (
    <div className="app">
      <header className="header">
        <div className="logo-title-area">
          <div className="logo-stack">
            <img src={`${BASE_URL}NCKU.png`} alt="NCKU" className="school-logo" />
            <img src={`${BASE_URL}MOU.png`} alt="MOU" className="mou-logo" />
          </div>

          <div>
            <p className="eyebrow">USV Water Quality Monitoring</p>
            <h1>無人船 CO₂ / CH₄ 湖面熱圖 Dashboard</h1>
            <p className="subtitle">
              目前使用 P1–P10 模擬資料，完成一輪後以 IDW 插值產生連續湖面熱圖。
            </p>
          </div>
        </div>

        <div className="status-card">
          <span className={isRunning ? "status-dot active" : "status-dot"} />
          <div>
            <p>監測狀態</p>
            <strong>{statusText}</strong>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel map-panel">
          <div className="panel-header">
            <div>
              <h2>{metricInfo.label} Spatial Distribution</h2>
              <p>Lake center：23.050278, 120.146667</p>
            </div>

            <div className="button-group metric-group">
              {Object.entries(METRIC_CONFIG).map(([key, item]) => (
                <button
                  key={key}
                  className={metric === key ? "active" : ""}
                  onClick={() => setMetric(key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="map-wrapper">
            <MapContainer
              center={[LAKE_CENTER.lat, LAKE_CENTER.lng]}
              zoom={18}
              scrollWheelZoom={true}
              zoomControl={true}
              className="map"
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                opacity={0.35}
              />

              <BoundsFitter />

              <Polygon
                positions={LAKE_POLYGON}
                pathOptions={{
                  color: "#12372f",
                  weight: 2.5,
                  fillColor: "#dbeee9",
                  fillOpacity: heatmapResult ? 0.08 : 0.45,
                }}
              />

              {heatmapResult && (
                <ImageOverlay
                  url={heatmapResult.imageUrl}
                  bounds={heatmapResult.bounds}
                  opacity={0.88}
                />
              )}

              {displayData.map((point) => (
                <CircleMarker
                  key={point.point_id}
                  center={[point.lat, point.lng]}
                  radius={7}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#1f4f46",
                    fillOpacity: 1,
                  }}
                  eventHandlers={{
                    mouseover: (e) => e.target.openPopup(),
                    mouseout: (e) => e.target.closePopup(),
                  }}
                >
                  <Tooltip permanent direction="top" offset={[0, -6]} opacity={1}>
                    <span style={{ fontSize: "12px", fontWeight: "bold" }}>
                      {point.point_id}
                    </span>
                  </Tooltip>

                  <Popup closeButton={false}>
                    <div style={{ fontSize: "14px", lineHeight: "1.9", minWidth: "220px" }}>
                      <strong style={{ fontSize: "16px", color: "#1f4f46" }}>
                        {point.point_id} 監測資料
                      </strong>

                      <hr style={{ border: "none", borderTop: "1px solid #d8e7e2", margin: "10px 0" }} />

                      <div>CO₂：{point.co2} ppm</div>
                      <div>CH₄：{point.ch4} ppm</div>
                      <div>透明度：{point.transparency} m</div>
                      <div>葉綠素 a：{point.chlorophyllA} μg/L</div>
                      <div>總磷：{point.totalPhosphorus} μg/L</div>

                      <hr style={{ border: "none", borderTop: "1px solid #d8e7e2", margin: "10px 0" }} />

                      <div style={{ color: "#6c7d78", fontSize: "12px" }}>
                        時間：{point.timestamp.split(" ")[1]}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>

            {!heatmapResult && (
              <div className="waiting-layer">
                <strong>等待 P1–P10 監測完成</strong>
                <span>
                  目前已收到 {currentRound.length}/{MONITOR_POINTS.length} 點
                </span>
              </div>
            )}

            <div className="legend">
              <div className="legend-title">
                {metricInfo.label} {metricInfo.unit}
              </div>
              <div className="legend-bar" />
              <div className="legend-values">
                <span>{heatmapResult?.minText ?? minValue}</span>
                <span>{heatmapResult?.maxText ?? maxValue}</span>
              </div>
            </div>
          </div>
        </section>

        <aside className="side">
          <section className="panel stats-panel">
            <h2>{metricInfo.label} Summary</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <span>平均值</span>
                <strong>{avgValue}</strong>
                <small>{metricInfo.unit}</small>
              </div>
              <div className="stat-card">
                <span>最高值</span>
                <strong>{maxValue}</strong>
                <small>{metricInfo.unit}</small>
              </div>
              <div className="stat-card">
                <span>最低值</span>
                <strong>{minValue}</strong>
                <small>{metricInfo.unit}</small>
              </div>
            </div>

            <button
              className="control-button"
              onClick={() => setIsRunning((prev) => !prev)}
            >
              {isRunning ? "暫停模擬接收" : "繼續模擬接收"}
            </button>
          </section>

          <section className="panel table-panel">
            <h2>本輪 P1–P10 資料</h2>

            <table>
              <thead>
                <tr>
                  <th>點位</th>
                  <th>CO₂</th>
                  <th>CH₄</th>
                  <th>透明度</th>
                  <th>葉綠素 a</th>
                  <th>總磷</th>
                  <th>時間</th>
                </tr>
              </thead>
              <tbody>
                {displayData.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty">
                      等待資料接收中
                    </td>
                  </tr>
                ) : (
                  displayData.map((item) => (
                    <tr key={item.point_id}>
                      <td>{item.point_id}</td>
                      <td>{item.co2}</td>
                      <td>{item.ch4}</td>
                      <td>{item.transparency}</td>
                      <td>{item.chlorophyllA}</td>
                      <td>{item.totalPhosphorus}</td>
                      <td>{item.timestamp.split(" ")[1]}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </aside>
      </main>
    </div>
  );
}

function createInterpolatedLakeHeatmap(data, metric) {
  const width = 720;
  const height = 720;
  const padding = 0.00015;

  const lats = LAKE_POLYGON.map((p) => p[0]);
  const lngs = LAKE_POLYGON.map((p) => p[1]);

  const minLat = Math.min(...lats) - padding;
  const maxLat = Math.max(...lats) + padding;
  const minLng = Math.min(...lngs) - padding;
  const maxLng = Math.max(...lngs) + padding;

  const values = data.map((d) => d[metric]).filter((v) => typeof v === "number");
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  for (let y = 0; y < height; y++) {
    const lat = maxLat - (y / (height - 1)) * (maxLat - minLat);

    for (let x = 0; x < width; x++) {
      const lng = minLng + (x / (width - 1)) * (maxLng - minLng);
      const index = (y * width + x) * 4;

      if (!isInsidePolygon([lat, lng], LAKE_POLYGON)) {
        pixels[index + 3] = 0;
        continue;
      }

      const interpolated = idwInterpolate(lat, lng, data, metric);
      const normalized =
        maxValue === minValue
          ? 0.5
          : (interpolated - minValue) / (maxValue - minValue);

      const [r, g, b] = getInterpolatedColor(normalized);

      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = 230;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const decimal = METRIC_CONFIG[metric].decimal;

  return {
    imageUrl: canvas.toDataURL("image/png"),
    bounds: [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
    minText: minValue.toFixed(decimal),
    maxText: maxValue.toFixed(decimal),
  };
}

function idwInterpolate(lat, lng, data, metric) {
  const power = 2.2;
  let numerator = 0;
  let denominator = 0;

  for (const point of data) {
    const distance = Math.sqrt(
      Math.pow(lat - point.lat, 2) + Math.pow(lng - point.lng, 2)
    );

    if (distance < 0.000001) return point[metric];

    const weight = 1 / Math.pow(distance, power);
    numerator += weight * point[metric];
    denominator += weight;
  }

  return numerator / denominator;
}

function isInsidePolygon(point, polygon) {
  const [lat, lng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersect =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;

    if (intersect) inside = !inside;
  }

  return inside;
}

function getInterpolatedColor(value) {
  const v = Math.max(0, Math.min(1, value));

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [startValue, startColor] = COLOR_STOPS[i];
    const [endValue, endColor] = COLOR_STOPS[i + 1];

    if (v >= startValue && v <= endValue) {
      const localRatio = (v - startValue) / (endValue - startValue);

      return startColor.map((start, index) =>
        Math.round(start + (endColor[index] - start) * localRatio)
      );
    }
  }

  return COLOR_STOPS[COLOR_STOPS.length - 1][1];
}