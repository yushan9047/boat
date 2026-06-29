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
  transparency: {
    label: "透明度",
    unit: "m",
    decimal: 2,
    dbKey: "transparency",
  },
  chlorophyllA: {
    label: "葉綠素 a",
    unit: "μg/L",
    decimal: 2,
    dbKey: "chlorophyll_a",
  },
  totalPhosphorus: {
    label: "總磷",
    unit: "μg/L",
    decimal: 2,
    dbKey: "total_phosphorus",
  },
  turbidity: {
    label: "濁度",
    unit: "NTU",
    decimal: 2,
    dbKey: "turbidity",
  },
};

const METRIC_GROUPS = [
  {
    id: "carbon",
    label: "碳排通量",
    caption: "碳排相關監測指標",
    metrics: ["co2", "ch4"],
  },
  {
    id: "ctsi",
    label: "CTSI",
    caption: "卡爾森優養化指數",
    metrics: ["transparency", "chlorophyllA", "totalPhosphorus"],
    hasInfo: true,
  },
  {
    id: "water",
    label: "水質參數",
    caption: "其他水質監測指標",
    metrics: ["turbidity"],
  },
];

const BASE_URL = import.meta.env.BASE_URL;


function MetricGroupIcon({ type }) {
  if (type === "carbon") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.5 4.5C12 4.8 6.7 8.1 5.4 13.3c-.7 2.8.5 5.1 2.6 5.7 2.4.7 4.9-.9 6.5-3.1 2.3-3.1 3.5-6.7 5-11.4Z" />
        <path d="M5 20c2.7-4.4 6.2-7.4 10.6-9.2" />
      </svg>
    );
  }

  if (type === "ctsi") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 7.5c2.2 0 2.2 1.7 4.4 1.7s2.2-1.7 4.4-1.7 2.2 1.7 4.4 1.7 2.2-1.7 4.8-1.7" />
        <path d="M3 12c2.2 0 2.2 1.7 4.4 1.7s2.2-1.7 4.4-1.7 2.2 1.7 4.4 1.7 2.2-1.7 4.8-1.7" />
        <path d="M3 16.5c2.2 0 2.2 1.7 4.4 1.7s2.2-1.7 4.4-1.7 2.2 1.7 4.4 1.7 2.2-1.7 4.8-1.7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2S5.8 10.3 5.8 15a6.2 6.2 0 0 0 12.4 0C18.2 10.3 12 3.2 12 3.2Z" />
      <path d="M9.2 16.1c.5 1.3 1.5 2 2.8 2.2" />
    </svg>
  );
}

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
  const [openMetricGroup, setOpenMetricGroup] = useState("");
  const [currentRound, setCurrentRound] = useState([]);
  const [completedData, setCompletedData] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [roundNumber, setRoundNumber] = useState(1);
  const [isRunning, setIsRunning] = useState(true);
  const [saveStatus, setSaveStatus] = useState("尚未寫入資料庫");
  const [showCtsiModal, setShowCtsiModal] = useState(false);
  const [ctsiTab, setCtsiTab] = useState("intro");

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
    if (currentLake?.areas) return currentLake.areas.map((area) => area.polygon);
    if (currentLake?.polygon) return [currentLake.polygon];
    return [];
  }, [currentLake]);

  const monitorPoints = useMemo(() => {
    if (currentLake?.points?.length > 0) return currentLake.points;

    if (currentLake?.areas?.length > 0) {
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

    if (currentLake?.polygon) return generateDefaultPoints(currentLake.polygon, 10);

    return [];
  }, [currentLake]);

  const historyPointOptions = useMemo(() => {
    if (historyLake === "all") return [];

    const targetLake = LAKES.find((lake) => lake.id === historyLake);
    if (!targetLake) return [];

    if (targetLake.points?.length > 0) return targetLake.points;

    if (targetLake.areas?.length > 0) {
      return targetLake.areas.map((area) => ({
        point_id: area.id,
        name: area.name,
      }));
    }

    return [];
  }, [historyLake]);

  function generateData(point) {
    const rawData = currentLake?.generator
      ? currentLake.generator(point)
      : generateBasicSensorData(point);

    return attachCtsiValues(rawData);
  }

  function openCtsiExplanation(tab = "intro") {
    setCtsiTab(tab);
    setShowCtsiModal(true);
  }

  useEffect(() => {
    setCurrentRound([]);
    setCompletedData([]);
    setCurrentIndex(0);
    setRoundNumber(1);
    savedRoundsRef.current = new Set();
    setSaveStatus("已切換監測區，尚未寫入資料庫");
  }, [selectedLakeId]);

  useEffect(() => {
    setHistoryPoint("all");
  }, [historyLake]);

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

    if (historyStart) query = query.gte("created_at", new Date(historyStart).toISOString());
    if (historyEnd) query = query.lte("created_at", new Date(historyEnd).toISOString());
    if (historyLake !== "all") query = query.eq("lake_id", historyLake);
    if (historyPoint !== "all") query = query.eq("point_id", historyPoint);

    const { data, error } = await query;

    if (error) {
      console.error("歷史資料查詢失敗：", error);
      setHistoryError("查詢失敗，請確認 Supabase 權限或欄位設定。");
      setHistoryResults([]);
    } else {
      setHistoryResults((data || []).map((row) => attachCtsiValuesFromDatabase(row)));
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
    if (displayData.length < monitorPoints.length || monitorPoints.length === 0) return null;
    return createInterpolatedLakeHeatmap(displayData, metric, lakePolygons);
  }, [displayData, metric, lakePolygons, monitorPoints]);

  const metricInfo = METRIC_CONFIG[metric];

  const values = displayData
    .map((item) => item[metric])
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  const minValue = values.length ? Math.min(...values).toFixed(metricInfo.decimal) : "-";
  const maxValue = values.length ? Math.max(...values).toFixed(metricInfo.decimal) : "-";
  const avgValue = values.length
    ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(metricInfo.decimal)
    : "-";

  const ctsiValues = displayData
    .map((item) => item.ctsi)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  const averageCtsi = ctsiValues.length
    ? ctsiValues.reduce((sum, value) => sum + value, 0) / ctsiValues.length
    : null;

  const ctsiLevel = averageCtsi === null ? "資料不足" : classifyCtsi(averageCtsi);

  const statusText =
    currentRound.length === 0
      ? `第 ${roundNumber} 輪監測準備中`
      : currentRound.length < monitorPoints.length
      ? `第 ${roundNumber} 輪監測中：已收到 ${currentRound.length}/${monitorPoints.length} 點`
      : "本輪資料已完成，正在更新熱圖";

  const historyMetricInfo = getHistoryMetricInfo(historyMetric);

  return (
    <div className="app">
      <header className="header">
        <div className="logo-title-area">
          <div className="logo-stack">
            <a href="https://web.ncku.edu.tw/" target="_blank" rel="noopener noreferrer">
              <img src={`${BASE_URL}NCKU.png`} alt="NCKU" className="school-logo" />
            </a>

            <a href="https://www.wra.gov.tw/" target="_blank" rel="noopener noreferrer">
              <img src={`${BASE_URL}MOU.png`} alt="水利署" className="mou-logo" />
            </a>
          </div>

          <div>
            <p className="eyebrow">USV Water Quality Monitoring</p>
            <h1>智慧無人船自動水域監測平台</h1>
            <p className="subtitle">目前監測區：{currentLake.name}</p>

            <div style={{ marginTop: "14px" }}>
              <select
                value={selectedLakeId}
                onChange={(event) => setSelectedLakeId(event.target.value)}
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
                {currentLake.name}｜Center：{currentLake.center.lat}, {currentLake.center.lng}
              </p>
            </div>
          </div>

          <div className="metric-selector-section">
            <div className="metric-selector-heading">
              <h3>指標切換</h3>
              <span>選擇分類後，再從第二層挑選監測項目</span>
            </div>

            {/* 第一層：固定只顯示三大分類 */}
            <div className="metric-level-one">
              {METRIC_GROUPS.map((group) => {
                const isOpen = openMetricGroup === group.id;
                const isActive = group.metrics.includes(metric);

                return (
                  <div
                    key={group.id}
                    className={`metric-level-one-item ${isOpen ? "open" : ""} ${
                      isActive ? "selected" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="metric-level-one-button"
                      onClick={() =>
                        setOpenMetricGroup((previousGroup) =>
                          previousGroup === group.id ? "" : group.id
                        )
                      }
                      aria-expanded={isOpen}
                      aria-controls={`metric-submenu-${group.id}`}
                    >
                      <span className={`metric-category-icon ${group.id}`}>
                        <MetricGroupIcon type={group.id} />
                      </span>
                      <span className="metric-category-copy">
                        <span className="metric-category-label">{group.label}</span>
                        <small>{group.caption}</small>
                      </span>
                      <span className="metric-category-arrow">{isOpen ? "⌃" : "⌄"}</span>
                    </button>

                    {group.hasInfo && (
                      <button
                        type="button"
                        className="ctsi-inline-info-button"
                        onClick={() => openCtsiExplanation("formula")}
                        aria-label="查看 CTSI 計算方法"
                        title="查看 CTSI 計算方法"
                      >
                        i
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 第二層：只有點擊第一層分類後才會出現 */}
            {openMetricGroup && (() => {
              const activeGroup = METRIC_GROUPS.find(
                (group) => group.id === openMetricGroup
              );

              if (!activeGroup) return null;

              return (
                <div
                  id={`metric-submenu-${activeGroup.id}`}
                  className={`metric-level-two metric-level-two-${activeGroup.id}`}
                >
                  <div className="metric-level-two-title">
                    <div>
                      <span>{activeGroup.label}</span>
                      <small>{activeGroup.caption}</small>
                    </div>
                    <strong>目前顯示：{metricInfo.label}</strong>
                  </div>

                  <div className="metric-level-two-options">
                    {activeGroup.metrics.map((metricKey) => (
                      <button
                        key={metricKey}
                        type="button"
                        className={metric === metricKey ? "active" : ""}
                        onClick={() => setMetric(metricKey)}
                      >
                        <span>{METRIC_CONFIG[metricKey].label}</span>
                        <small>{METRIC_CONFIG[metricKey].unit}</small>
                      </button>
                    ))}

                    {activeGroup.id === "ctsi" && (
                      <button
                        type="button"
                        className="metric-level-two-explain"
                        onClick={() => openCtsiExplanation("intro")}
                      >
                        CTSI 說明／計算方法
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
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
                    mouseover: (event) => event.target.openPopup(),
                    mouseout: (event) => event.target.closePopup(),
                  }}
                >
                  <Tooltip permanent direction="top" offset={[0, -6]} opacity={1}>
                    <span style={{ fontSize: "12px", fontWeight: "bold" }}>
                      {point.point_id}
                    </span>
                  </Tooltip>

                  <Popup closeButton={false}>
                    <div style={{ fontSize: "14px", lineHeight: "1.9", minWidth: "230px" }}>
                      <strong style={{ fontSize: "16px", color: "#1f4f46" }}>
                        {point.point_id} 監測資料
                      </strong>
                      <hr
                        style={{
                          border: "none",
                          borderTop: "1px solid #d8e7e2",
                          margin: "10px 0",
                        }}
                      />
                      <div>CO₂：{point.co2} ppm</div>
                      <div>CH₄：{point.ch4} ppm</div>
                      <div>透明度：{point.transparency} m</div>
                      <div>葉綠素 a：{point.chlorophyllA} μg/L</div>
                      <div>總磷：{point.totalPhosphorus} μg/L</div>
                      <div>濁度：{point.turbidity} NTU</div>
                      <div>
                        CTSI：{point.ctsi ?? "資料不足"}
                        {point.ctsi !== null && point.ctsi !== undefined
                          ? `（${classifyCtsi(point.ctsi)}）`
                          : ""}
                      </div>
                      <hr
                        style={{
                          border: "none",
                          borderTop: "1px solid #d8e7e2",
                          margin: "10px 0",
                        }}
                      />
                      <div style={{ color: "#6c7d78", fontSize: "12px" }}>
                        時間：{point.timestamp?.split(" ")[1] || "-"}
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

            <div className="ctsi-summary-card">
              <div>
                <span>本輪平均 CTSI</span>
                <strong>{averageCtsi === null ? "-" : averageCtsi.toFixed(2)}</strong>
              </div>
              <div>
                <span>優養化判讀</span>
                <strong>{ctsiLevel}</strong>
              </div>
              <button type="button" onClick={() => openCtsiExplanation("classification")}>
                查看判讀方式
              </button>
            </div>

            <button className="control-button" onClick={() => setIsRunning((prev) => !prev)}>
              {isRunning ? "暫停接收" : "繼續接收"}
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
                  <th>CTSI</th>
                  <th>時間</th>
                </tr>
              </thead>
              <tbody>
                {displayData.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty">
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
                      <td>{item.ctsi ?? "資料不足"}</td>
                      <td>{item.timestamp?.split(" ")[1] || "-"}</td>
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
              onChange={(event) => setHistoryStart(event.target.value)}
            />
          </label>

          <label>
            結束時間
            <input
              type="datetime-local"
              value={historyEnd}
              onChange={(event) => setHistoryEnd(event.target.value)}
            />
          </label>

          <label>
            湖區
            <select value={historyLake} onChange={(event) => setHistoryLake(event.target.value)}>
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
            <select
              value={historyPoint}
              onChange={(event) => setHistoryPoint(event.target.value)}
              disabled={historyLake === "all"}
            >
              <option value="all">
                {historyLake === "all" ? "請先選擇湖區" : "全部點位"}
              </option>
              {historyPointOptions.map((point) => (
                <option key={point.point_id} value={point.point_id}>
                  {point.point_id}
                </option>
              ))}
            </select>
          </label>

          <label>
            監測項目
            <select
              value={historyMetric}
              onChange={(event) => setHistoryMetric(event.target.value)}
            >
              <option value="all">全部項目</option>
              <optgroup label="碳排通量">
                <option value="co2">CO₂</option>
                <option value="ch4">CH₄</option>
              </optgroup>
              <optgroup label="CTSI 卡爾森指數">
                <option value="transparency">透明度</option>
                <option value="chlorophyllA">葉綠素 a</option>
                <option value="totalPhosphorus">總磷</option>
                <option value="ctsi">CTSI（自動計算）</option>
              </optgroup>
              <optgroup label="水質參數">
                <option value="turbidity">濁度</option>
              </optgroup>
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

        <div className="history-result-info">查詢結果：{historyResults.length} 筆</div>

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
                    <th>CTSI</th>
                  </>
                ) : (
                  <th>
                    {historyMetricInfo.label}
                    {historyMetricInfo.unit ? ` (${historyMetricInfo.unit})` : ""}
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {historyResults.length === 0 ? (
                <tr>
                  <td colSpan={historyMetric === "all" ? 11 : 5} className="empty">
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
                        <td>{formatNumber(row.chlorophyllA, 2)}</td>
                        <td>{formatNumber(row.totalPhosphorus, 2)}</td>
                        <td>{formatNumber(row.turbidity, 2)}</td>
                        <td>{formatNumber(row.ctsi, 2)}</td>
                      </>
                    ) : (
                      <td>{formatHistoryMetricValue(row, historyMetric)}</td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCtsiModal && (
        <div className="ctsi-modal-mask" onMouseDown={() => setShowCtsiModal(false)}>
          <div className="ctsi-modal ctsi-modal-large" onMouseDown={(event) => event.stopPropagation()}>
            <div className="ctsi-modal-header">
              <div>
                <p className="ctsi-modal-eyebrow">CTSI Explanation</p>
                <h2>CTSI 卡爾森優養化指數說明</h2>
              </div>
              <button type="button" onClick={() => setShowCtsiModal(false)}>
                ×
              </button>
            </div>

            <div className="ctsi-modal-layout">
              <nav className="ctsi-modal-nav" aria-label="CTSI 說明選單">
                <button
                  type="button"
                  className={ctsiTab === "intro" ? "active" : ""}
                  onClick={() => setCtsiTab("intro")}
                >
                  <span>1</span>什麼是 CTSI
                </button>
                <button
                  type="button"
                  className={ctsiTab === "formula" ? "active" : ""}
                  onClick={() => setCtsiTab("formula")}
                >
                  <span>2</span>計算公式
                </button>
                <button
                  type="button"
                  className={ctsiTab === "classification" ? "active" : ""}
                  onClick={() => setCtsiTab("classification")}
                >
                  <span>3</span>優養化程度判讀
                </button>
                <button
                  type="button"
                  className={ctsiTab === "sources" ? "active" : ""}
                  onClick={() => setCtsiTab("sources")}
                >
                  <span>4</span>資料來源
                </button>
              </nav>

              <div className="ctsi-modal-content">
                {ctsiTab === "intro" && (
                  <section>
                    <h3>什麼是 CTSI</h3>
                    <p>
                      CTSI（Carlson Trophic State Index）以透明度、葉綠素 a 與總磷三項指標，
                      綜合評估水體的優養化程度。
                    </p>
                    <div className="ctsi-intro-grid">
                      <article>
                        <strong>透明度 SD</strong>
                        <span>反映水體清澈程度，單位為 m。</span>
                      </article>
                      <article>
                        <strong>葉綠素 a Chl-a</strong>
                        <span>反映藻類生物量，單位為 μg/L。</span>
                      </article>
                      <article>
                        <strong>總磷 TP</strong>
                        <span>反映水體磷營養鹽含量，單位為 μg/L。</span>
                      </article>
                    </div>
                    <div className="ctsi-auto-note">
                      系統會在三項原始資料皆完整且大於 0 時，自動計算 TSI(SD)、
                      TSI(Chl-a)、TSI(TP) 與最終 CTSI；資料不完整時顯示「資料不足」。
                    </div>
                  </section>
                )}

                {ctsiTab === "formula" && (
                  <section>
                    <h3>計算公式</h3>
                    <p>CTSI 由三項指標的 TSI 值取平均。ln 代表自然對數。</p>

                    <div className="ctsi-formula-grid">
                      <div className="ctsi-formula-card">
                        <strong>透明度 TSI(SD)</strong>
                        <p>TSI(SD) = 60 − 14.41 × ln(SD)</p>
                        <small>SD：透明度（m）</small>
                      </div>

                      <div className="ctsi-formula-card">
                        <strong>葉綠素 a TSI(Chl-a)</strong>
                        <p>TSI(Chl-a) = 9.81 × ln(Chl-a) + 30.6</p>
                        <small>Chl-a：葉綠素 a（μg/L）</small>
                      </div>

                      <div className="ctsi-formula-card">
                        <strong>總磷 TSI(TP)</strong>
                        <p>TSI(TP) = 14.42 × ln(TP) + 4.15</p>
                        <small>TP：總磷（μg/L）</small>
                      </div>
                    </div>

                    <div className="ctsi-final-formula">
                      <span>卡爾森指數 CTSI</span>
                      <strong>CTSI = [TSI(SD) + TSI(Chl-a) + TSI(TP)] ÷ 3</strong>
                      <small>指數越高，代表水體優養化程度越嚴重。</small>
                    </div>
                  </section>
                )}

                {ctsiTab === "classification" && (
                  <section>
                    <h3>優養化程度判讀</h3>
                    <p>系統依照平均 CTSI 顯示水體狀態，作為快速判讀依據。</p>
                    <div className="ctsi-level-list">
                      <div>
                        <strong>CTSI &lt; 40</strong>
                        <span>貧養</span>
                        <small>營養鹽與藻類量較低，水體通常較清澈。</small>
                      </div>
                      <div>
                        <strong>40 ≤ CTSI &lt; 50</strong>
                        <span>中養</span>
                        <small>營養狀態居中，需持續追蹤變化。</small>
                      </div>
                      <div>
                        <strong>50 ≤ CTSI &lt; 70</strong>
                        <span>優養</span>
                        <small>營養鹽與藻類量偏高，優養化風險增加。</small>
                      </div>
                      <div>
                        <strong>CTSI ≥ 70</strong>
                        <span>高度優養</span>
                        <small>優養化程度明顯，建議加強水質管理與監測。</small>
                      </div>
                    </div>
                  </section>
                )}

                {ctsiTab === "sources" && (
                  <section>
                    <h3>資料來源</h3>
                    <p>以下連結可查閱 CTSI、優養化與水質監測相關資料。</p>
                    <div className="ctsi-source-list">
                      <a
                        href="https://wq.moenv.gov.tw/EWQP/zh/Encyclopedia/NounDefinition/Pedia_18.aspx"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <strong>環境部</strong>
                        <span>水質百科與優養化相關說明</span>
                        <small>開啟資料來源 ↗</small>
                      </a>

                      <a
                        href="https://web.wra.gov.tw/twmo/cp.aspx?n=8657"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <strong>經濟部水利署</strong>
                        <span>水質監測與相關公開資料</span>
                        <small>開啟資料來源 ↗</small>
                      </a>
                    </div>
                  </section>
                )}
              </div>
            </div>

            <button
              type="button"
              className="ctsi-close-button"
              onClick={() => setShowCtsiModal(false)}
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function createInterpolatedLakeHeatmap(data, metric, polygons) {
  const width = 720;
  const height = 720;
  const padding = 0.00015;
  const allPoints = polygons.flat();

  if (allPoints.length === 0) return null;

  const lats = allPoints.map((point) => point[0]);
  const lngs = allPoints.map((point) => point[1]);

  const minLat = Math.min(...lats) - padding;
  const maxLat = Math.max(...lats) + padding;
  const minLng = Math.min(...lngs) - padding;
  const maxLng = Math.max(...lngs) + padding;

  const usableData = data.filter(
    (item) => typeof item[metric] === "number" && Number.isFinite(item[metric])
  );

  if (usableData.length === 0) return null;

  const values = usableData.map((item) => item[metric]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  const imageData = context.createImageData(width, height);
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

      const interpolated = idwInterpolate(lat, lng, usableData, metric);
      const normalized =
        maxValue === minValue ? 0.5 : (interpolated - minValue) / (maxValue - minValue);
      const [red, green, blue] = getInterpolatedColor(normalized);

      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = 230;
    }
  }

  context.putImageData(imageData, 0, 0);

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
    const distance = Math.sqrt(Math.pow(lat - point.lat, 2) + Math.pow(lng - point.lng, 2));
    if (distance < 0.000001) return point[metric];

    const weight = 1 / Math.pow(distance, power);
    numerator += weight * point[metric];
    denominator += weight;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

function calculateCtsiValues(transparency, chlorophyllA, totalPhosphorus) {
  const sd = Number(transparency);
  const chla = Number(chlorophyllA);
  const tp = Number(totalPhosphorus);

  if (
    !Number.isFinite(sd) ||
    !Number.isFinite(chla) ||
    !Number.isFinite(tp) ||
    sd <= 0 ||
    chla <= 0 ||
    tp <= 0
  ) {
    return {
      tsiSd: null,
      tsiChla: null,
      tsiTp: null,
      ctsi: null,
    };
  }

  const tsiSd = 60 - 14.41 * Math.log(sd);
  const tsiChla = 9.81 * Math.log(chla) + 30.6;
  const tsiTp = 14.42 * Math.log(tp) + 4.15;
  const ctsi = (tsiSd + tsiChla + tsiTp) / 3;

  return {
    tsiSd: Number(tsiSd.toFixed(2)),
    tsiChla: Number(tsiChla.toFixed(2)),
    tsiTp: Number(tsiTp.toFixed(2)),
    ctsi: Number(ctsi.toFixed(2)),
  };
}

function attachCtsiValues(item) {
  const calculated = calculateCtsiValues(
    item.transparency,
    item.chlorophyllA,
    item.totalPhosphorus
  );

  return {
    ...item,
    ...calculated,
  };
}

function attachCtsiValuesFromDatabase(row) {
  const normalized = {
    ...row,
    chlorophyllA: row.chlorophyllA ?? row.chlorophyll_a,
    totalPhosphorus: row.totalPhosphorus ?? row.total_phosphorus,
  };

  return attachCtsiValues(normalized);
}

function classifyCtsi(value) {
  const ctsi = Number(value);
  if (!Number.isFinite(ctsi)) return "資料不足";
  if (ctsi < 40) return "貧養";
  if (ctsi < 50) return "中養";
  if (ctsi < 70) return "優養";
  return "高度優養";
}

function getHistoryMetricInfo(metric) {
  if (metric === "ctsi") {
    return { label: "CTSI", unit: "", decimal: 2 };
  }

  return METRIC_CONFIG[metric] || { label: "監測值", unit: "", decimal: 2 };
}

function formatHistoryMetricValue(row, metric) {
  if (metric === "ctsi") return formatNumber(row.ctsi, 2);

  const config = METRIC_CONFIG[metric];
  if (!config) return "-";

  if (metric === "chlorophyllA") return formatNumber(row.chlorophyllA, config.decimal);
  if (metric === "totalPhosphorus") {
    return formatNumber(row.totalPhosphorus, config.decimal);
  }

  return formatNumber(row[config.dbKey], config.decimal);
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
  const normalizedValue = Math.max(0, Math.min(1, value));

  for (let index = 0; index < COLOR_STOPS.length - 1; index++) {
    const [startValue, startColor] = COLOR_STOPS[index];
    const [endValue, endColor] = COLOR_STOPS[index + 1];

    if (normalizedValue >= startValue && normalizedValue <= endValue) {
      const localRatio = (normalizedValue - startValue) / (endValue - startValue);
      return startColor.map((startChannel, channelIndex) =>
        Math.round(
          startChannel + (endColor[channelIndex] - startChannel) * localRatio
        )
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
    const point = usable[(index * step) % usable.length];
    return {
      point_id: `P${index + 1}`,
      name: `P${index + 1}`,
      lat: point[0],
      lng: point[1],
    };
  });
}

function getPolygonCenter(polygon) {
  const usable = polygon.slice(0, -1);
  const lat = usable.reduce((sum, point) => sum + point[0], 0) / usable.length;
  const lng = usable.reduce((sum, point) => sum + point[1], 0) / usable.length;
  return { lat, lng };
}

function formatNumber(value, decimal = 2) {
  if (value === null || value === undefined || value === "") return "-";

  const number = Number(value);
  if (!Number.isFinite(number)) return "-";

  return number.toFixed(decimal);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", {
    hour12: false,
  });
}
