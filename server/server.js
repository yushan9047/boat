import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS monitoring_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number INTEGER NOT NULL,
      point_id TEXT NOT NULL,
      point_name TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      co2 REAL,
      ch4 REAL,
      transparency REAL,
      chlorophyll_a REAL,
      total_phosphorus REAL,
      recorded_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "API server is running",
  });
});

app.post("/api/monitoring-records", (req, res) => {
  const {
    round_number,
    point_id,
    point_name,
    lat,
    lng,
    co2,
    ch4,
    transparency,
    chlorophyll_a,
    total_phosphorus,
    recorded_at,
  } = req.body;

  if (!round_number || !point_id || lat === undefined || lng === undefined) {
    return res.status(400).json({
      error: "round_number, point_id, lat, lng are required",
    });
  }

  const sql = `
    INSERT INTO monitoring_records (
      round_number,
      point_id,
      point_name,
      lat,
      lng,
      co2,
      ch4,
      transparency,
      chlorophyll_a,
      total_phosphorus,
      recorded_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      round_number,
      point_id,
      point_name,
      lat,
      lng,
      co2,
      ch4,
      transparency,
      chlorophyll_a,
      total_phosphorus,
      recorded_at,
    ],
    function (err) {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        message: "record inserted",
        id: this.lastID,
      });
    }
  );
});

app.post("/api/monitoring-round", (req, res) => {
  const { round_number, records } = req.body;

  if (!round_number || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      error: "round_number and records are required",
    });
  }

  const sql = `
    INSERT INTO monitoring_records (
      round_number,
      point_id,
      point_name,
      lat,
      lng,
      co2,
      ch4,
      transparency,
      chlorophyll_a,
      total_phosphorus,
      recorded_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.serialize(() => {
    const stmt = db.prepare(sql);

    for (const item of records) {
      stmt.run([
        round_number,
        item.point_id,
        item.name || item.point_name || "",
        item.lat,
        item.lng,
        item.co2,
        item.ch4,
        item.transparency,
        item.chlorophyllA ?? item.chlorophyll_a,
        item.totalPhosphorus ?? item.total_phosphorus,
        item.timestamp || item.recorded_at,
      ]);
    }

    stmt.finalize((err) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json({
        message: "round inserted",
        round_number,
        count: records.length,
      });
    });
  });
});

app.get("/api/monitoring-records", (req, res) => {
  db.all(
    `
    SELECT *
    FROM monitoring_records
    ORDER BY created_at DESC, id DESC
    LIMIT 200
    `,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      res.json(rows);
    }
  );
});

app.get("/api/latest-round", (req, res) => {
  db.get(
    `
    SELECT round_number
    FROM monitoring_records
    ORDER BY round_number DESC
    LIMIT 1
    `,
    [],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          error: err.message,
        });
      }

      if (!row) {
        return res.json([]);
      }

      db.all(
        `
        SELECT *
        FROM monitoring_records
        WHERE round_number = ?
        ORDER BY 
          CAST(REPLACE(point_id, 'P', '') AS INTEGER) ASC
        `,
        [row.round_number],
        (err2, rows) => {
          if (err2) {
            return res.status(500).json({
              error: err2.message,
            });
          }

          res.json(rows);
        }
      );
    }
  );
});

app.delete("/api/monitoring-records", (req, res) => {
  db.run(`DELETE FROM monitoring_records`, [], function (err) {
    if (err) {
      return res.status(500).json({
        error: err.message,
      });
    }

    res.json({
      message: "all records deleted",
      deleted: this.changes,
    });
  });
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});