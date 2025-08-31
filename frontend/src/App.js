import React, {useMemo, useState } from "react";
import Papa from "papaparse";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Grid,
  Card,
  CardContent,
  Box,
  Button,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Chip,
  Slider,
  CircularProgress,
  TextField,
} from "@mui/material";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";


const nice = (n) => n?.toLocaleString?.() ?? n;

const yearMarks = (min, max) => {
  const step = Math.max(1, Math.floor((max - min) / 6));
  const marks = [];
  for (let y = min; y <= max; y += step) marks.push({ value: y, label: String(y) });
  if (marks[marks.length - 1]?.value !== max) marks.push({ value: max, label: String(max) });
  return marks;
};

export default function App() {
  const [raw, setRaw] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [yearRange, setYearRange] = useState([2010, 2025]);
  const [makeQuery, setMakeQuery] = useState("");

  // Attempt to infer min/max years once data is loaded
  const [yearBounds, setYearBounds] = useState([2010, 2025]);

  const parseCsvRows = (rows) => {
    return rows.map((r) => {
      const yr = Number(r["Model Year"] ?? r.model_year ?? r.modelYear);
      const rng = Number(r["Electric Range"] ?? r.electric_range ?? r.range);
      const type = String(r["Electric Vehicle Type"] ?? r.type ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const make = String(r["Make"] ?? r.make ?? "").trim();
      const state = String(r["State"] ?? r.state ?? "").trim();
      const cafv = String(
        r["Clean Alternative Fuel Vehicle (CAFV) Eligibility"] ?? r.cafv ?? ""
      ).trim();
      return {
        year: Number.isFinite(yr) ? yr : null,
        range: Number.isFinite(rng) ? rng : null,
        type,
        make,
        state,
        cafv,
        city: r["City"] ?? "",
        county: r["County"] ?? "",
      };
    });
  };

  const handleFile = (file) => {
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows = parseCsvRows(res.data);
        setRaw(rows);
        const ys = rows.map((d) => d.year).filter((x) => Number.isFinite(x));
        const minY = ys.length ? Math.min(...ys) : 2010;
        const maxY = ys.length ? Math.max(...ys) : 2025;
        setYearBounds([minY, maxY]);
        setYearRange([minY, maxY]);
        setLoading(false);
      },
      error: () => setLoading(false),
    });
  };

  const loadFromPublic = async () => {
    setLoading(true);
    try {
      const res = await fetch("/Electric_Vehicle_Population_Data.csv");
      const text = await res.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => {
          const rows = parseCsvRows(r.data);
          setRaw(rows);
          const ys = rows.map((d) => d.year).filter((x) => Number.isFinite(x));
          const minY = ys.length ? Math.min(...ys) : 2010;
          const maxY = ys.length ? Math.max(...ys) : 2025;
          setYearBounds([minY, maxY]);
          setYearRange([minY, maxY]);
          setLoading(false);
        },
        error: () => setLoading(false),
      });
    } catch (e) {
      setLoading(false);
    }
  };

  // Derived filtered dataset
  const data = useMemo(() => {
    const [yMin, yMax] = yearRange;
    const mq = makeQuery.trim().toLowerCase();
    return raw.filter((d) => {
      if (Number.isFinite(d.year)) {
        if (d.year < yMin || d.year > yMax) return false;
      }
      if (stateFilter !== "ALL" && d.state !== stateFilter) return false;
      if (typeFilter !== "ALL" && d.type !== typeFilter) return false;
      if (mq && !d.make.toLowerCase().includes(mq)) return false;
      return true;
    });
  }, [raw, yearRange, stateFilter, typeFilter, makeQuery]);

  // KPIs
  const { total, uniqueMakes, avgRange, cafvPct } = useMemo(() => {
    const total = data.length;
    const makeSet = new Set(data.map((d) => d.make).filter(Boolean));
    const ranges = data.map((d) => d.range).filter((x) => Number.isFinite(x) && x > 0);
    const avgRange = ranges.length
      ? Math.round(ranges.reduce((a, b) => a + b, 0) / ranges.length)
      : 0;
    const eligible = data.filter((d) => /Eligible/i.test(d.cafv));
    const cafvPct = total ? Math.round((eligible.length / total) * 100) : 0;
    return { total, uniqueMakes: makeSet.size, avgRange, cafvPct };
  }, [data]);

  // Line: EVs by Model Year
  const byYear = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      if (!Number.isFinite(d.year)) return;
      map.set(d.year, (map.get(d.year) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, count]) => ({ year, count }));
  }, [data]);

  // Bar: Top 10 Makes
  const topMakes = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      if (!d.make) return;
      map.set(d.make, (map.get(d.make) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([make, count]) => ({ make, count }));
  }, [data]);

  // Pie: EV Type distribution
  const typeDist = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      const key = d.type || "Unknown";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [data]);

  // Pie: CAFV distribution
  const cafvDist = useMemo(() => {
    const map = new Map();
    data.forEach((d) => {
      const key = d.cafv || "Unknown";
      map.set(key, (map.get(key) || 0) + 1);
    });
    // collapse long-tail into top 4 + Other
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
    const res = top.map(([name, value]) => ({ name, value }));
    if (rest > 0) res.push({ name: "Other", value: rest });
    return res;
  }, [data]);

  // Histogram: Electric Range bins
  const rangeHist = useMemo(() => {
    const bins = [
      { label: "0", min: 0, max: 0 },
      { label: "1–50", min: 1, max: 50 },
      { label: "51–100", min: 51, max: 100 },
      { label: "101–200", min: 101, max: 200 },
      { label: "201–300", min: 201, max: 300 },
      { label: "301+", min: 301, max: Infinity },
    ];
    const counts = bins.map((b) => ({ ...b, count: 0 }));
    data.forEach((d) => {
      const r = d.range;
      if (!Number.isFinite(r)) return;
      for (const b of counts) {
        if (r >= b.min && r <= b.max) {
          b.count += 1;
          break;
        }
      }
    });
    return counts.map((b) => ({ bin: b.label, count: b.count }));
  }, [data]);

  const allStates = useMemo(() => {
    const s = new Set(raw.map((d) => d.state).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [raw]);

  const allTypes = useMemo(() => {
    const s = new Set(raw.map((d) => d.type).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [raw]);

  const [minY, maxY] = yearBounds;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#909193ff", color: "#e8ecf1" }}>
      <AppBar position="static" sx={{ bgcolor: "#8f9ee0ff" }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            MapUp · EV Analytics Dashboard
          </Typography>
          <Button onClick={loadFromPublic} variant="contained" sx={{ mr: 1 }}>
            Load sample CSV
          </Button>
          <Button component="label" variant="outlined" sx={{ color: "#e8ecf1", borderColor: "#3a4a6a" }}>
            Upload CSV
            <input hidden type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {/* Filters */}
        <Card sx={{ bgcolor: "#dfdfe1ff", borderRadius: 3, mb: 3 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="state-label">State</InputLabel>
                  <Select
                    labelId="state-label"
                    label="State"
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value)}
                  >
                    {allStates.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={17} md={7}>
                <FormControl fullWidth size="small">
                  <InputLabel id="type-label">EV Type</InputLabel>
                  <Select
                    labelId="type-label"
                    label="EV Type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    {allTypes.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={7}>
                <Typography variant="caption" sx={{ opacity: 0.8, mb: 1, display: "block" }}>
                  Model Year Range
                </Typography>
                <Slider
                  value={yearRange}
                  min={minY}
                  max={maxY}
                  onChange={(_, v) => setYearRange(v)}
                  valueLabelDisplay="auto"
                  marks={[
                    { value: minY, label: String(minY) },
                    { value: Math.floor((minY + maxY) / 2), label: String(Math.floor((minY + maxY) / 2)) },
                    { value: maxY, label: String(maxY) },
                  ]}
                  sx={{
                    color: "#1976d2",
                    height: 8,
                    "& .MuiSlider-thumb": {
                      width: 20,
                      height: 20,
                      backgroundColor: "#fff",
                      border: "2px solid currentColor",
                    },
                    "& .MuiSlider-valueLabel": {
                      background: "#1976d2",
                      color: "#fff",
                    },
                    "& .MuiSlider-markLabel": {
                      fontSize: "12px",
                      color: "#444",
                      marginTop: "8px",
                    },
                  }}
                />
              </Grid>
              <Grid item xs={12} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Enter your search query"
                  value={makeQuery}
                  onChange={(e) => setMakeQuery(e.target.value)}
                />
              </Grid>
            </Grid>
            <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}>
              <Chip label={`Rows: ${nice(data.length)}`} />
              <Chip label={`States: ${nice(allStates.length - 1)}`} />
              <Chip label={`Types: ${nice(allTypes.length - 1)}`} />
            </Box>
          </CardContent>
        </Card>

        {/* KPIs */}
        <Grid container spacing={2} sx={{ mb: 1 }}>
          {[
            { label: "Total EVs", value: nice(total) },
            { label: "Unique Makes", value: nice(uniqueMakes) },
            { label: "Avg Range", value: `${nice(avgRange)} mi` },
            { label: "CAFV Eligible", value: `${nice(cafvPct)}%` },
          ].map((k) => (
            <Grid key={k.label} item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: "#b7c3f1ff", borderRadius: 3 }}>
                <CardContent>
                  <Typography variant="overline" sx={{ opacity: 0.7 }}>
                    {k.label}
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 0.5 }}>
                    {k.value}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Row 1: Line + Bar */}
            <Grid container spacing={2}>
              {/* Line Chart */}
              <Grid item xs={25} md={22}>
                <Card sx={{ bgcolor: "#fcfcfcff", borderRadius: 3, height: 380 }}>
                  <CardContent sx={{ height: "100%", p: 2 }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      EV Adoption by Model Year
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={byYear}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="count" name="EVs" stroke="#1976d2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>

              {/* Bar Chart */}
              <Grid item xs={12} md={5}>
                <Card sx={{ bgcolor: "#f4f5f9ff", borderRadius: 3, height: 380 }}>
                  <CardContent sx={{ height: "100%" }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      Top 10 EV Makes
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={topMakes}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="make"
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" name="Vehicles" fill="#82ca9d" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>


            {/* Row 2: Pie + Pie + Hist */}
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={12} md={8}>
                <Card sx={{ bgcolor: "#eff0f3ff", borderRadius: 3, height: 360 }}>
                  <CardContent sx={{ height: "200%", width: "100%" }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      EV Type Distribution
                    </Typography>
                    <ResponsiveContainer width="100%" height={360}>
                      <PieChart>
                        <Pie dataKey="value" data={typeDist} nameKey="name" outerRadius={100} label />
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card sx={{ bgcolor: "#f2f3f7ff", borderRadius: 3, height: 360 }}>
                  <CardContent sx={{ height: "100%" }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      CAFV Eligibility
                    </Typography>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie dataKey="value" data={cafvDist} nameKey="name" outerRadius={100} label />
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card sx={{ bgcolor: "#e5e6ecff", borderRadius: 3, height: 360 }}>
                  <CardContent sx={{ height: "100%" }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      Electric Range Histogram
                    </Typography>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={rangeHist}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="bin" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="count" name="Vehicles" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Raw peek */}
            <Card sx={{ bgcolor: "#dee0e7ff", borderRadius: 3, mt: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Data Snapshot (first 20 after filters)
                </Typography>
                <Box component="div" sx={{ overflow: "auto", maxHeight: 320, pr: 1 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        {["year", "make", "type", "range", "state", "city", "county", "cafv"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #2a3558" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 20).map((d, i) => (
                        <tr key={i}>
                          <td style={{ padding: 8, borderBottom: "1px solid #1f2947" }}>{d.year}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #1f2947" }}>{d.make}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #1f2947" }}>{d.type}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #1f2947" }}>{d.range}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #1f2947" }}>{d.state}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #1f2947" }}>{d.city}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #1f2947" }}>{d.county}</td>
                          <td style={{ padding: 8, borderBottom: "1px solid #1f2947" }}>{d.cafv}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Box>
              </CardContent>
            </Card>
          </>
        )}

        <Box sx={{ color: "#8ea0c0", textAlign: "center", mt: 3, fontSize: 12 }}>
          Built with React · Material UI · Recharts · PapaParse.
        </Box>
      </Container>
    </Box>
  );
}
