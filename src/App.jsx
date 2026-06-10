import { useEffect, useMemo, useRef, useState } from "react";
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
import { LAKES } from "./data/lakes/lakeConfig";
import { supabase } from "./lib/supabaseClient";

const COLOR_STOPS = [
  [0.0, [49, 130, 189]],
  [0.25, [171, 217, 233]],
  [0.5, [255, 255, 191]],
  [0.75, [253, 174, 97]],
  [1.0, [215, 25, 28]],
];

const METRIC_CONFIG = {
  co2: { label: "CO₂", unit: "ppm", decimal: 2, dbKey: "co2" },
  ch4: { label: "CH₄", unit: "ppm", decimal: 4, dbKey: "ch4" },
  transparency: { label: "透明度", unit: "m", decimal: 2, dbKey: "transparency" },
  chlorophyllA: { label: "葉綠素 a", unit: "μg/L", decimal: 2, dbKey: "chlorophyll_a" },
  totalPhosphorus: { label: "總磷", unit: "μg/L", decimal: 2, dbKey: "total_phosphorus" },
  turbidity: { label: "濁度", unit: "NTU", decimal: 2, dbKey: "turbidity" },
};

const BASE_URL = import.meta.env.BASE_URL;

function BoundsFitter({ polygons }) {
  const map = useMap();

  useEffect(() => {
    const allPoints = polygons.flat();
    if (allPoints.length > 0) {
      map.fitBounds(allPoints, { padding: [80, 80] });
    }
  }, [map, polygons]);

  return null;
}

export default function App() {
  const [selectedLakeId, setSelectedLakeId] = useState(LAKES[0]?.id || "ncku");
  const [metric, setMetric] = useState("co2");
  const [currentRound, setCurrentRound] = useState([]);
  const [completedData, setCompletedData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);
  const [isRunning, setIsRunning] = useState(true);
  const [saveStatus, setSaveStatus] = useState("尚未寫入資料庫");

  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const [historyLake, setHistoryLake] = useState("all");
  const [historyPoint, setHistoryPoint] = useState("all");
  const [historyMetric, setHistoryMetric] = useState("all");
  const [historyResults, setHistoryResults] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const savedRoundsRef = useRef(new Set());

  const currentLake = useMemo(() => {
    return LAKES.find((lake) => lake.id === selectedLakeId) || LAKES[0];
  }, [selectedLakeId]);

  const lakePolygons = useMemo(() => {
    if (currentLake?.areas) {
      return currentLake.areas.map((area) => area.polygon);
    }

    if (currentLake?.polygon) {
      return [currentLake.polygon];
    }

    return [];
  }, [currentLake]);

  const monitorPoints = useMemo(() => {
    if (currentLake?.points && currentLake.points.length > 0) {
      return currentLake.points;
    }

    if (currentLake?.areas && currentLake.areas.length > 0) {
      return currentLake.areas.map((area) => {
        const center = getPolygonCenter(area.polygon);
        return {
          point_id: area.id,
          name: area.name,
          lat: center.lat,
          lng: center.lng,
        };
      });
    }

    if (currentLake?.polygon) {
      return generateDefaultPoints(currentLake.polygon, 10);
    }

    return [];
  }, [currentLake]);

  function generateData(point) {
    if (currentLake?.generator) {
      return currentLake.generator(point);
    }

    return generateBasicSensorData(point);
  }

  useEffect(() => {
    setCurrentRound([]);
    setCompletedData([]);
    setCurrentIndex(0);
    setRoundNumber(1);
    savedRoundsRef.current = new Set();
    setSaveStatus("已切換監測區，尚未寫入資料庫");
  }, [selectedLakeId]);

  async function saveRoundToSupabase(targetRoundNumber, records) {
    const saveKey = `${selectedLakeId}-${targetRoundNumber}`;
    if (savedRoundsRef.current.has(saveKey)) return;

    savedRoundsRef.current.add(saveKey);
    setSaveStatus("正在寫入 Supabase...");

    const payload = records.map((item) => ({
      lake_id: currentLake.id,
      lake_name: currentLake.name,
      round_number: targetRoundNumber,
      point_id: item.point_id,
      point_name: item.name,
      lat: item.lat,
      lng: item.lng,
      co2: item.co2,
      ch4: item.ch4,
      transparency: item.transparency,
      chlorophyll_a: item.chlorophyllA,
      total_phosphorus: item.totalPhosphorus,
      turbidity: item.turbidity,
      recorded_at: item.timestamp,
    }));

    const { error } = await supabase.from("monitoring_records").insert(payload);

    if (error) {
      console.error("Supabase 寫入失敗：", error);
      setSaveStatus("Supabase 寫入失敗，請檢查資料表欄位或 RLS");
      return;
    }

    setSaveStatus(`第 ${targetRoundNumber} 輪已寫入，共 ${payload.length} 筆`);
  }

  async function searchHistoryRecords() {
    setHistoryLoading(true);
    setHistoryError("");

    let query = supabase
      .from("monitoring_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (historyStart) {
      query = query.gte("created_at", new Date(historyStart).toISOString());
    }

    if (historyEnd) {
      query = query.lte("created_at", new Date(historyEnd).toISOString());
    }

    if (historyLake !== "all") {
      query = query.eq("lake_id", historyLake);
    }

    if (historyPoint !== "all") {
      query = query.eq("point_id", historyPoint);
    }

    const { data, error } = await query;

    if (error) {
      console.error("歷史資料查詢失敗：", error);
      setHistoryError("查詢失敗，請確認 Supabase 權限或欄位設定。");
      setHistoryResults([]);
    } else {
      setHistoryResults(data || []);
    }

    setHistoryLoading(false);
  }

  function clearHistorySearch() {
    setHistoryStart("");
    setHistoryEnd("");
    setHistoryLake("all");
    setHistoryPoint("all");
    setHistoryMetric("all");
    setHistoryResults([]);
    setHistoryError("");
  }

  useEffect(() => {
    if (!isRunning || monitorPoints.length === 0) return;

    const timer = setInterval(() => {
      const point = monitorPoints[currentIndex];

      if (!point) {
        setCurrentIndex(0);
        return;
      }

      const newData = generateData(point);

      setCurrentRound((prev) => {
        const updated = [...prev, newData];

        if (updated.length === monitorPoints.length) {
          setCompletedData(updated);
          saveRoundToSupabase(roundNumber, updated);

          setTimeout(() => {
            setCurrentRound([]);
            setCurrentIndex(0);
            setRoundNumber((prevRound) => prevRound + 1);
          }, 800);
        }

        return updated;
      });

      setCurrentIndex((prev) => {
        if (prev + 1 >= monitorPoints.length) return prev;
        return prev + 1;
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [currentIndex, isRunning, roundNumber, monitorPoints, selectedLakeId]);

  const displayData = completedData.length > 0 ? completedData : currentRound;

  const heatmapResult = useMemo(() => {
    if (displayData.length < monitorPoints.length || monitorPoints.length === 0) {
      return null;
    }

    return createInterpolatedLakeHeatmap(displayData, metric, lakePolygons);
  }, [displayData, metric, lakePolygons, monitorPoints]);

  const metricInfo = METRIC_CONFIG[metric];

  const values = displayData
    .map((item) => item[metric])
    .filter((v) => typeof v === "number");

  const minValue = values.length
    ? Math.min(...values).toFixed(metricInfo.decimal)
    : "-";

  const maxValue = values.length
    ? Math.max(...values).toFixed(metricInfo.decimal)
    : "-";

  const avgValue = values.length
    ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(metricInfo.decimal)
    : "-";

  const statusText =
    currentRound.length === 0
      ? `第 ${roundNumber} 輪監測準備中`
      : currentRound.length < monitorPoints.length
      ? `第 ${roundNumber} 輪監測中：已收到 ${currentRound.length}/${monitorPoints.length} 點`
      : "本輪資料已完成，正在更新熱圖";

  const historyMetricConfig =
    historyMetric === "all" ? null : METRIC_CONFIG[historyMetric];

  return (
    <div className="app">
      <header className="header">
        <div className="logo-title-area">
          <div className="logo-stack">
            <a
              href="https://web.ncku.edu.tw/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="前往國立成功大學網站"
            >
              <img src={`${BASE_URL}NCKU.png`} alt="NCKU" className="school-logo" />
            </a>

            <a
              href="https://www.wra.gov.tw/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="前往水利署網站"
            >
              <img src={`${BASE_URL}MOU.png`} alt="水利署" className="mou-logo" />
            </a>
          </div>

          <div>
            <p className="eyebrow">USV Water Quality Monitoring</p>
            <h1>無人船 CO₂ / CH₄ 湖面熱圖 Dashboard</h1>
            <p className="subtitle">
              目前監測區：{currentLake.name}，完成一輪後以 IDW 插值產生連續湖面熱圖。
            </p>

            <div style={{ marginTop: "14px" }}>
              <select
                value={selectedLakeId}
                onChange={(e) => setSelectedLakeId(e.target.value)}
                style={{
                  padding: "11px 16px",
                  borderRadius: "12px",
                  border: "1px solid #d8e7e2",
                  fontSize: "15px",
                  minWidth: "240px",
                  color: "#12372f",
                  fontWeight: 700,
                }}
              >
                {LAKES.map((lake) => (
                  <option key={lake.id} value={lake.id}>
                    {lake.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="status-card">
          <span className={isRunning ? "status-dot active" : "status-dot"} />
          <div>
            <p>監測狀態</p>
            <strong>{statusText}</strong>
            <p style={{ marginTop: "8px", fontSize: "13px" }}>{saveStatus}</p>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel map-panel">
          <div className="panel-header">
            <div>
              <h2>{metricInfo.label} Spatial Distribution</h2>
              <p>
                {currentLake.name}｜Center：{currentLake.center.lat},{" "}
                {currentLake.center.lng}
              </p>
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
              center={[currentLake.center.lat, currentLake.center.lng]}
              zoom={15}
              scrollWheelZoom={true}
              zoomControl={true}
              className="map"
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                opacity={0.35}
              />

              <BoundsFitter polygons={lakePolygons} />

              {lakePolygons.map((polygon, index) => (
                <Polygon
                  key={`polygon-${index}`}
                  positions={polygon}
                  pathOptions={{
                    color: "#12372f",
                    weight: 2.5,
                    fillColor: "#dbeee9",
                    fillOpacity: heatmapResult ? 0.08 : 0.45,
                  }}
                />
              ))}

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
                      <div>濁度：{point.turbidity} NTU</div>

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
                <strong>等待本輪監測完成</strong>
                <span>
                  目前已收到 {currentRound.length}/{monitorPoints.length} 點
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
            <h2>本輪資料</h2>

            <table>
              <thead>
                <tr>
                  <th>點位</th>
                  <th>CO₂</th>
                  <th>CH₄</th>
                  <th>透明度</th>
                  <th>葉綠素 a</th>
                  <th>總磷</th>
                  <th>濁度</th>
                  <th>時間</th>
                </tr>
              </thead>
              <tbody>
                {displayData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty">
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
                      <td>{item.turbidity}</td>
                      <td>{item.timestamp.split(" ")[1]}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </aside>
      </main>

      <section className="panel history-panel">
        <div className="history-header">
          <div>
            <h2>歷史資料查詢</h2>
            <p>可依照日期時間、湖區、點位與監測項目搜尋 Supabase 資料庫紀錄。</p>
          </div>
        </div>

        <div className="history-filters">
          <label>
            起始時間
            <input
              type="datetime-local"
              value={historyStart}
              onChange={(e) => setHistoryStart(e.target.value)}
            />
          </label>

          <label>
            結束時間
            <input
              type="datetime-local"
              value={historyEnd}
              onChange={(e) => setHistoryEnd(e.target.value)}
            />
          </label>

          <label>
            湖區
            <select value={historyLake} onChange={(e) => setHistoryLake(e.target.value)}>
              <option value="all">全部湖區</option>
              {LAKES.map((lake) => (
                <option key={lake.id} value={lake.id}>
                  {lake.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            點位
            <select value={historyPoint} onChange={(e) => setHistoryPoint(e.target.value)}>
              <option value="all">全部點位</option>
              {monitorPoints.map((point) => (
                <option key={point.point_id} value={point.point_id}>
                  {point.point_id}
                </option>
              ))}
            </select>
          </label>

          <label>
            監測項目
            <select value={historyMetric} onChange={(e) => setHistoryMetric(e.target.value)}>
              <option value="all">全部項目</option>
              {Object.entries(METRIC_CONFIG).map(([key, item]) => (
                <option key={key} value={key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="history-actions">
            <button onClick={searchHistoryRecords} disabled={historyLoading}>
              {historyLoading ? "查詢中..." : "查詢資料"}
            </button>
            <button className="secondary-button" onClick={clearHistorySearch}>
              清除
            </button>
          </div>
        </div>

        {historyError && <p className="history-error">{historyError}</p>}

        <div className="history-result-info">
          查詢結果：{historyResults.length} 筆
        </div>

        <div className="history-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>建立時間</th>
                <th>湖區</th>
                <th>輪次</th>
                <th>點位</th>
                {historyMetric === "all" ? (
                  <>
                    <th>CO₂</th>
                    <th>CH₄</th>
                    <th>透明度</th>
                    <th>葉綠素 a</th>
                    <th>總磷</th>
                    <th>濁度</th>
                  </>
                ) : (
                  <th>
                    {historyMetricConfig.label} ({historyMetricConfig.unit})
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {historyResults.length === 0 ? (
                <tr>
                  <td colSpan={historyMetric === "all" ? 10 : 5} className="empty">
                    尚無查詢資料
                  </td>
                </tr>
              ) : (
                historyResults.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td>{row.lake_name || "-"}</td>
                    <td>{row.round_number}</td>
                    <td>{row.point_id}</td>

                    {historyMetric === "all" ? (
                      <>
                        <td>{formatNumber(row.co2, 2)}</td>
                        <td>{formatNumber(row.ch4, 4)}</td>
                        <td>{formatNumber(row.transparency, 2)}</td>
                        <td>{formatNumber(row.chlorophyll_a, 2)}</td>
                        <td>{formatNumber(row.total_phosphorus, 2)}</td>
                        <td>{formatNumber(row.turbidity, 2)}</td>
                      </>
                    ) : (
                      <td>
                        {formatNumber(
                          row[historyMetricConfig.dbKey],
                          historyMetricConfig.decimal
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function createInterpolatedLakeHeatmap(data, metric, polygons) {
  const width = 720;
  const height = 720;
  const padding = 0.00015;
  const allPoints = polygons.flat();

  const lats = allPoints.map((p) => p[0]);
  const lngs = allPoints.map((p) => p[1]);

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

      if (!isInsideAnyPolygon([lat, lng], polygons)) {
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

  return {
    imageUrl: canvas.toDataURL("image/png"),
    bounds: [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
    minText: minValue.toFixed(METRIC_CONFIG[metric].decimal),
    maxText: maxValue.toFixed(METRIC_CONFIG[metric].decimal),
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

function isInsideAnyPolygon(point, polygons) {
  return polygons.some((polygon) => isInsidePolygon(point, polygon));
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

function generateBasicSensorData(point) {
  const co2 = 520 + Math.random() * 80;
  const ch4 = 1.98 + Math.random() * 0.04;
  const transparency = 0.1 + Math.random() * 4.9;
  const chlorophyllA = 2.0 + Math.random() * 7.9;
  const totalPhosphorus = 5 + Math.random() * 25;
  const turbidity = 1 + Math.random() * 9;

  return {
    ...point,
    co2: Number(co2.toFixed(2)),
    ch4: Number(ch4.toFixed(4)),
    transparency: Number(transparency.toFixed(2)),
    chlorophyllA: Number(chlorophyllA.toFixed(2)),
    totalPhosphorus: Number(totalPhosphorus.toFixed(2)),
    turbidity: Number(turbidity.toFixed(2)),
    timestamp: new Date().toLocaleString("zh-TW", {
      hour12: false,
    }),
  };
}

function generateDefaultPoints(polygon, count = 10) {
  const usable = polygon.slice(0, -1);
  const step = Math.max(1, Math.floor(usable.length / count));

  return Array.from({ length: count }).map((_, index) => {
    const p = usable[(index * step) % usable.length];

    return {
      point_id: `P${index + 1}`,
      name: `P${index + 1}`,
      lat: p[0],
      lng: p[1],
    };
  });
}

function getPolygonCenter(polygon) {
  const usable = polygon.slice(0, -1);
  const lat = usable.reduce((sum, p) => sum + p[0], 0) / usable.length;
  const lng = usable.reduce((sum, p) => sum + p[1], 0) / usable.length;

  return { lat, lng };
}

function formatNumber(value, decimal = 2) {
  if (value === null || value === undefined) return "-";
  return Number(value).toFixed(decimal);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", {
    hour12: false,
  });
}