// 조립셀 생산 대시보드. 차트는 외부 라이브러리 없이 SVG와 HTML로 그린다.
(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  const DATA_URL = "data/production.json";
  const CALIBRATION_SOON_DAYS = 30;
  const DAY_MS = 24 * 60 * 60 * 1000;

  // ---------- 숫자와 날짜 표시 ----------
  const num = (value) => value.toLocaleString("ko-KR");
  const pct = (value, digits = 1) => (value == null ? "-" : `${(value * 100).toFixed(digits)}%`);
  const toMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const shortDate = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  const longDate = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;

  // ---------- 집계 ----------
  function summarize(rows) {
    const total = rows.reduce(
      (sum, row) => ({
        plan: sum.plan + row.plan,
        actual: sum.actual + row.actual,
        defect: sum.defect + row.defect,
        downtime: sum.downtime + row.downtime,
      }),
      { plan: 0, actual: 0, defect: 0, downtime: 0 },
    );
    return {
      ...total,
      achieve: total.plan ? total.actual / total.plan : null,
      defectRate: total.actual ? total.defect / total.actual : null,
    };
  }

  function groupBy(rows, key) {
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row[key])) groups.set(row[key], []);
      groups.get(row[key]).push(row);
    }
    return [...groups.entries()];
  }

  // 엑셀 [집계] 시트의 판정 수식과 같은 기준이다.
  function judge(achieve, defectRate) {
    if (achieve == null) return null;
    if (achieve < 0.95 || defectRate > 0.05) return "집중관리";
    if (achieve >= 0.98 && defectRate <= 0.01) return "양호";
    return "관찰";
  }

  function calibrationStatus(nextDate, baseDate) {
    const days = Math.round((toMs(nextDate) - toMs(baseDate)) / DAY_MS);
    if (days < 0) return { label: "기한 지남", tone: "critical", detail: `${-days}일 지남` };
    if (days <= CALIBRATION_SOON_DAYS) return { label: "임박", tone: "warning", detail: `${days}일 남음` };
    return { label: "정상", tone: "good", detail: `${days}일 남음` };
  }

  // ---------- 공통 부품 ----------
  const STATUS_TONE = { 양호: "good", 관찰: "warning", 집중관리: "critical" };
  const STATUS_ICON = { good: "✓", warning: "◆", critical: "▲" };

  function StatusChip({ label, tone }) {
    return (
      <span className={`dash-status ${tone}`}>
        <span className="dash-status-icon" aria-hidden="true">{STATUS_ICON[tone]}</span>
        {label}
      </span>
    );
  }

  function Card({ title, subtitle, wide, children }) {
    return (
      <section className={`dash-card${wide ? " wide" : ""}`}>
        <h2>{title}</h2>
        {subtitle && <p className="dash-card-sub">{subtitle}</p>}
        {children}
      </section>
    );
  }

  function useWidth() {
    const ref = useRef(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
      const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
      observer.observe(ref.current);
      return () => observer.disconnect();
    }, []);
    return [ref, width];
  }

  function Tooltip({ x, y, width, title, rows }) {
    const toLeft = x > width / 2;
    return (
      <div
        className="dash-tooltip"
        style={{ left: x, top: y, transform: `translateX(${toLeft ? "calc(-100% - 12px)" : "12px"})` }}
      >
        <div className="dash-tooltip-title">{title}</div>
        {rows.map(([label, value]) => (
          <div className="dash-tooltip-row" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    );
  }

  // ---------- 날짜별 차트 (선 또는 막대) ----------
  function TimeChart({ days, kind, valueOf, label, formatValue, yMin, yMax, yTicks, reference }) {
    const [ref, width] = useWidth();
    const [active, setActive] = useState(null);
    const height = 220;
    const margin = { top: 18, right: 16, bottom: 26, left: 44 };
    const plotWidth = Math.max(width - margin.left - margin.right, 1);
    const plotHeight = height - margin.top - margin.bottom;

    const first = toMs(days[0].date);
    const span = toMs(days[days.length - 1].date) - first;
    const xOf = (iso) =>
      margin.left + (span === 0 ? plotWidth / 2 : ((toMs(iso) - first) / span) * plotWidth);
    const yOf = (value) => margin.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;
    const baseline = margin.top + plotHeight;

    const calendarDays = Math.round(span / DAY_MS) + 1;
    const barWidth = Math.max(Math.min(24, (plotWidth / calendarDays) * 0.7), 3);
    // 막대가 양쪽 끝에서 잘리지 않도록 그릴 때 안쪽으로 조금 옮긴다.
    const xBar = (iso) => Math.min(Math.max(xOf(iso), margin.left + barWidth / 2), margin.left + plotWidth - barWidth / 2);
    const xPos = kind === "column" ? xBar : xOf;

    const tickEvery = Math.max(1, Math.ceil(days.length / Math.max(Math.floor(plotWidth / 56), 1)));
    const xTicks = days.filter((_, index) => index % tickEvery === 0);

    const values = days.map(valueOf);
    const extreme = kind === "line" ? Math.min(...values) : Math.max(...values);
    const extremeIndex = values.indexOf(extreme);
    const showExtreme = kind === "line" ? extreme < 1 : extreme > 0;

    function nearest(event) {
      const box = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - box.left;
      let best = 0;
      days.forEach((day, index) => {
        if (Math.abs(xPos(day.date) - x) < Math.abs(xPos(days[best].date) - x)) best = index;
      });
      setActive(best);
    }

    function handleKey(event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      setActive((current) => {
        const start = current == null ? days.length - 1 : current + step;
        return Math.min(Math.max(start, 0), days.length - 1);
      });
    }

    const activeDay = active != null ? days[Math.min(active, days.length - 1)] : null;
    const linePath = days
      .map((day, index) => `${index ? "L" : "M"}${xPos(day.date)},${yOf(valueOf(day))}`)
      .join(" ");
    const extremeX = xPos(days[extremeIndex].date);
    const extremeY = yOf(extreme);
    const extremeToLeft = extremeX > margin.left + plotWidth / 2;

    return (
      <div className="dash-plot" ref={ref} style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            tabIndex="0"
            aria-label={`${label}. 좌우 화살표 키로 날짜를 이동합니다. 전체 값은 아래 일별 표에 있습니다.`}
            onPointerMove={nearest}
            onPointerDown={nearest}
            onPointerLeave={() => setActive(null)}
            onKeyDown={handleKey}
            onFocus={() => setActive((current) => (current == null ? days.length - 1 : current))}
            onBlur={() => setActive(null)}
          >
            {yTicks.map((tick) => (
              <g key={tick}>
                <line className="dash-grid" x1={margin.left} x2={margin.left + plotWidth} y1={yOf(tick)} y2={yOf(tick)} />
                <text className="dash-axis" x={margin.left - 8} y={yOf(tick) + 4} textAnchor="end">
                  {formatValue(tick, true)}
                </text>
              </g>
            ))}
            <line className="dash-baseline" x1={margin.left} x2={margin.left + plotWidth} y1={baseline} y2={baseline} />
            {xTicks.map((day) => (
              <text
                key={day.date}
                className="dash-axis"
                x={Math.min(Math.max(xPos(day.date), margin.left + 12), margin.left + plotWidth - 12)}
                y={height - 7}
                textAnchor="middle"
              >
                {shortDate(day.date)}
              </text>
            ))}

            {reference && (
              <g>
                <line className="dash-reference" x1={margin.left} x2={margin.left + plotWidth} y1={yOf(reference.value)} y2={yOf(reference.value)} />
                <text className="dash-reference-label" x={margin.left + 6} y={yOf(reference.value) + 14}>
                  {reference.label}
                </text>
              </g>
            )}

            {kind === "line" && <path className="dash-line" d={linePath} />}
            {kind === "line" && days.length === 1 && (
              <circle className="dash-dot" cx={xPos(days[0].date)} cy={yOf(values[0])} r="4" />
            )}
            {kind === "column" &&
              days.map((day, index) => {
                const value = valueOf(day);
                if (value <= 0) return null;
                const top = yOf(value);
                const x = xPos(day.date) - barWidth / 2;
                const radius = Math.min(4, barWidth / 2, baseline - top);
                return (
                  <path
                    key={day.date}
                    className={`dash-column${activeDay === days[index] ? " active" : ""}`}
                    d={`M${x},${baseline} V${top + radius} Q${x},${top} ${x + radius},${top} H${x + barWidth - radius} Q${x + barWidth},${top} ${x + barWidth},${top + radius} V${baseline} Z`}
                  />
                );
              })}

            {showExtreme && (
              <g>
                {kind === "line" && <circle className="dash-dot" cx={extremeX} cy={extremeY} r="4" />}
                <text
                  className="dash-mark-label"
                  x={kind === "line" ? extremeX + (extremeToLeft ? -10 : 10) : extremeX + (extremeToLeft ? -(barWidth / 2 + 6) : barWidth / 2 + 6)}
                  y={kind === "line" ? extremeY + 4 : extremeY + 11}
                  textAnchor={extremeToLeft ? "end" : "start"}
                >
                  {shortDate(days[extremeIndex].date)} {formatValue(extreme)}
                </text>
              </g>
            )}

            {activeDay && kind === "line" && (
              <g>
                <line className="dash-crosshair" x1={xPos(activeDay.date)} x2={xPos(activeDay.date)} y1={margin.top} y2={baseline} />
                <circle className="dash-dot" cx={xPos(activeDay.date)} cy={yOf(valueOf(activeDay))} r="4" />
              </g>
            )}
          </svg>
        )}
        {activeDay && (
          <Tooltip
            x={xPos(activeDay.date)}
            y={margin.top}
            width={width}
            title={longDate(activeDay.date)}
            rows={[
              [`${label}`, formatValue(valueOf(activeDay))],
              ["계획 / 실적", `${num(activeDay.plan)} / ${num(activeDay.actual)}`],
              ["불량", `${num(activeDay.defect)}건`],
              ["비가동", `${num(activeDay.downtime)}분`],
            ]}
          />
        )}
      </div>
    );
  }

  // ---------- 항목별 가로 차트 (막대 또는 점) ----------
  function RankChart({ items, kind = "bar", min = 0, max, marker }) {
    const [activeName, setActiveName] = useState(null);
    const top = max ?? Math.max(...items.map((item) => item.value), marker?.value ?? 0, 0);
    const position = (value) => (top > min ? Math.min(Math.max((value - min) / (top - min), 0), 1) * 100 : 0);

    if (items.length === 0) return <p className="dash-empty-note">표시할 내용이 없습니다.</p>;

    return (
      <ul className="dash-rank">
        {items.map((item) => (
          <li
            key={item.name}
            className={`dash-rank-row${activeName === item.name ? " active" : ""}`}
            tabIndex={item.detail ? 0 : undefined}
            onPointerEnter={() => setActiveName(item.name)}
            onPointerLeave={() => setActiveName(null)}
            onFocus={() => setActiveName(item.name)}
            onBlur={() => setActiveName(null)}
          >
            <span className="dash-rank-name">{item.name}</span>
            <span className={`dash-rank-track ${kind}`}>
              {marker && <span className="dash-rank-marker" style={{ left: `${position(marker.value)}%` }} />}
              {kind === "bar" && item.value > 0 && (
                <span className="dash-rank-bar" style={{ width: `${position(item.value)}%` }} />
              )}
              {kind === "dot" && <span className="dash-rank-dot" style={{ left: `${position(item.value)}%` }} />}
            </span>
            <span className="dash-rank-value">{item.label}</span>
            {activeName === item.name && item.detail && <span className="dash-rank-tip">{item.detail}</span>}
          </li>
        ))}
      </ul>
    );
  }

  // ---------- 요약 문장 ----------
  function buildInsights(processes, days, reasons, total) {
    const lines = [];
    const critical = processes.filter((process) => process.status === "집중관리");
    if (critical.length) {
      lines.push(
        `집중관리 공정 ${critical.length}개: ${critical
          .map((process) => `${process.name} (달성률 ${pct(process.achieve)}, 불량률 ${pct(process.defectRate)})`)
          .join(", ")}`,
      );
    } else {
      lines.push("집중관리 기준에 해당하는 공정이 없습니다.");
    }
    const worst = days.reduce((low, day) => (day.achieve < low.achieve ? day : low), days[0]);
    if (worst.achieve < 1) {
      lines.push(`달성률이 가장 낮은 날: ${longDate(worst.date)} ${pct(worst.achieve)} (비가동 ${num(worst.downtime)}분, 불량 ${num(worst.defect)}건)`);
    }
    if (reasons.length) {
      lines.push(`비가동이 가장 긴 사유: ${reasons[0].name} ${num(reasons[0].value)}분 (전체 비가동의 ${pct(reasons[0].value / total.downtime, 0)})`);
    }
    return lines;
  }

  // ---------- 화면 ----------
  function Dashboard({ data }) {
    const allDates = useMemo(() => [...new Set(data.rows.map((row) => row.date))].sort(), [data]);
    const cells = useMemo(() => [...new Set(data.rows.map((row) => row.cell))], [data]);
    const minDate = allDates[0];
    const maxDate = allDates[allDates.length - 1];
    const [start, setStart] = useState(minDate);
    const [end, setEnd] = useState(maxDate);
    const [cell, setCell] = useState("전체");

    const from = start || minDate;
    const to = end || maxDate;
    const rows = data.rows.filter(
      (row) => row.date >= from && row.date <= to && (cell === "전체" || row.cell === cell),
    );

    const header = (
      <header className="dash-header">
        <div className="dash-inner dash-header-row">
          <div>
            <p className="dash-eyebrow">생산기술실 · 교육용 가상 자료</p>
            <h1>{data.title.replace("생산실적", "생산 대시보드")}</h1>
          </div>
          <a className="dash-link" href="capstone.html">캡스톤 안내</a>
        </div>
      </header>
    );

    const filters = (
      <form className="dash-filters" onSubmit={(event) => event.preventDefault()}>
        <label>
          시작일
          <input type="date" value={start} min={minDate} max={maxDate} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label>
          종료일
          <input type="date" value={end} min={minDate} max={maxDate} onChange={(event) => setEnd(event.target.value)} />
        </label>
        <div className="dash-segment" role="group" aria-label="셀 선택">
          {["전체", ...cells].map((name) => (
            <button key={name} type="button" aria-pressed={cell === name} onClick={() => setCell(name)}>
              {name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="dash-reset"
          onClick={() => {
            setStart(minDate);
            setEnd(maxDate);
            setCell("전체");
          }}
        >
          처음 상태로
        </button>
      </form>
    );

    const equipmentInCell = new Set(
      data.rows.filter((row) => cell === "전체" || row.cell === cell).map((row) => row.equipment),
    );
    const calibrations = data.equipment
      .filter((item) => equipmentInCell.has(item.code))
      .map((item) => ({ ...item, status: calibrationStatus(item.nextCalibration, data.baseDate) }));

    const calibrationCard = (
      <Card
        wide
        title="설비 교정 현황"
        subtitle={`${longDate(data.baseDate)} 기준. ${CALIBRATION_SOON_DAYS}일 이내면 임박으로 표시합니다. 기간 선택과 관계없이 항상 같은 기준일을 씁니다.`}
      >
        <div className="dash-table-wrap">
          <table className="dash-table" id="calibration-table">
            <thead>
              <tr>
                <th scope="col">설비</th>
                <th scope="col">담당자</th>
                <th scope="col" className="num">주기</th>
                <th scope="col">최근 교정</th>
                <th scope="col">다음 교정</th>
                <th scope="col">상태</th>
              </tr>
            </thead>
            <tbody>
              {calibrations.map((item) => (
                <tr key={item.code}>
                  <td>{item.code} {item.name}</td>
                  <td>{item.owner}</td>
                  <td className="num">{item.cycleMonths}개월</td>
                  <td className="num-text">{item.lastCalibration}</td>
                  <td className="num-text">{item.nextCalibration}</td>
                  <td><StatusChip label={`${item.status.label} (${item.status.detail})`} tone={item.status.tone} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );

    const footnote = (
      <p className="dash-source">
        출처: {data.source} ([생산실적], [설비마스터] 시트). 판정 기준은 [집계] 시트와 같습니다.
        집중관리: 달성률 95% 미만 또는 불량률 5% 초과 / 양호: 달성률 98% 이상이고 불량률 1% 이하 / 관찰: 그 외.
      </p>
    );

    if (rows.length === 0) {
      return (
        <div className="dash">
          {header}
          <div className="dash-inner dash-body">
            {filters}
            <p className="dash-empty" role="status">선택한 기간에 데이터가 없습니다. 시작일과 종료일을 확인해 주세요.</p>
            <div className="dash-grid-cards">{calibrationCard}</div>
            {footnote}
          </div>
        </div>
      );
    }

    const total = summarize(rows);
    const days = groupBy(rows, "date")
      .map(([date, group]) => ({ date, ...summarize(group) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const processes = groupBy(rows, "process").map(([name, group]) => {
      const summary = summarize(group);
      const equipment = data.equipment.find((item) => item.code === group[0].equipment);
      return {
        name,
        code: group[0].equipment,
        owner: equipment?.owner ?? "미등록",
        ...summary,
        status: judge(summary.achieve, summary.defectRate),
        reasons: groupBy(group.filter((row) => row.reason), "reason").map(
          ([reason, list]) => `${reason} ${list.reduce((sum, row) => sum + row.downtime, 0)}분`,
        ),
      };
    });
    const reasons = groupBy(rows.filter((row) => row.reason), "reason")
      .map(([name, group]) => {
        const value = group.reduce((sum, row) => sum + row.downtime, 0);
        const byProcess = groupBy(group, "process").map(
          ([process, list]) => `${process} ${list.reduce((sum, row) => sum + row.downtime, 0)}분`,
        );
        return {
          name,
          value,
          label: `${num(value)}분`,
          detail: `${group.length}건, 전체의 ${pct(value / total.downtime, 0)} · ${byProcess.join(", ")}`,
        };
      })
      .sort((a, b) => b.value - a.value);

    const criticalCount = processes.filter((process) => process.status === "집중관리").length;
    const insights = buildInsights(processes, days, reasons, total);

    const lowestAchieve = Math.min(...days.map((day) => day.achieve));
    const lineMin = Math.min(0.85, Math.floor(lowestAchieve * 20) / 20);
    const lineTicks = [];
    for (let tick = lineMin; tick <= 1.0001; tick += 0.05) lineTicks.push(Number(tick.toFixed(2)));

    const maxDown = Math.max(...days.map((day) => day.downtime), 1);
    const downStep = [1, 5, 10, 20, 50, 100, 200, 500].find((step) => maxDown / step <= 4) ?? 1000;
    const downMax = Math.ceil(maxDown / downStep) * downStep;
    const downTicks = [];
    for (let tick = 0; tick <= downMax; tick += downStep) downTicks.push(tick);

    const lowestProcess = Math.min(...processes.map((process) => process.achieve));
    const dotMin = Math.min(0.9, Math.floor(lowestProcess * 20) / 20);

    return (
      <div className="dash">
        {header}
        <div className="dash-inner dash-body">
          {filters}

          <section className="dash-kpis" aria-label="주요 지표">
            <div className="dash-kpi dash-kpi-main">
              <span className="dash-kpi-label">계획 달성률</span>
              <strong className="dash-kpi-value">{pct(total.achieve)}</strong>
              <span className="dash-kpi-sub">실적 {num(total.actual)} / 계획 {num(total.plan)}</span>
            </div>
            <div className="dash-kpi">
              <span className="dash-kpi-label">불량률</span>
              <strong className="dash-kpi-value">{pct(total.defectRate, 2)}</strong>
              <span className="dash-kpi-sub">불량 {num(total.defect)}건</span>
            </div>
            <div className="dash-kpi">
              <span className="dash-kpi-label">비가동 시간</span>
              <strong className="dash-kpi-value">{num(total.downtime)}분</strong>
              <span className="dash-kpi-sub">약 {(total.downtime / 60).toFixed(1)}시간</span>
            </div>
            <div className="dash-kpi">
              <span className="dash-kpi-label">집중관리 공정</span>
              <strong className="dash-kpi-value">{criticalCount}개</strong>
              <span className="dash-kpi-sub">전체 {processes.length}개 공정 중</span>
            </div>
          </section>

          <section className="dash-insights" aria-label="핵심 내용">
            <h2>핵심 내용</h2>
            <ul>
              {insights.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>

          <div className="dash-grid-cards">
            <Card title="일별 계획 달성률" subtitle="세로축은 일부 구간만 표시합니다.">
              <TimeChart
                days={days}
                kind="line"
                valueOf={(day) => day.achieve}
                label="달성률"
                formatValue={(value, isTick) => pct(value, isTick ? 0 : 1)}
                yMin={lineMin}
                yMax={1}
                yTicks={lineTicks}
                reference={{ value: 0.95, label: "95% 집중관리 기준" }}
              />
            </Card>
            <Card title="일별 비가동 시간" subtitle="하루 전체 공정의 비가동 시간(분)을 합한 값입니다.">
              <TimeChart
                days={days}
                kind="column"
                valueOf={(day) => day.downtime}
                label="비가동"
                formatValue={(value, isTick) => (isTick ? num(value) : `${num(value)}분`)}
                yMin={0}
                yMax={downMax}
                yTicks={downTicks}
              />
            </Card>
            <Card
              title="공정별 계획 달성률"
              subtitle={`낮은 순서입니다. ${pct(dotMin, 0)}~100% 구간만 표시하며, 세로선은 집중관리 기준 95%입니다.`}
            >
              <RankChart
                kind="dot"
                min={dotMin}
                max={1}
                marker={{ value: 0.95 }}
                items={[...processes]
                  .sort((a, b) => a.achieve - b.achieve)
                  .map((process) => ({
                    name: process.name,
                    value: process.achieve,
                    label: pct(process.achieve),
                    detail: `실적 ${num(process.actual)} / 계획 ${num(process.plan)}`,
                  }))}
              />
            </Card>
            <Card title="공정별 불량률" subtitle="높은 순서입니다. 세로선은 집중관리 기준 5%입니다.">
              <RankChart
                marker={{ value: 0.05 }}
                items={[...processes]
                  .sort((a, b) => b.defectRate - a.defectRate)
                  .map((process) => ({
                    name: process.name,
                    value: process.defectRate,
                    label: pct(process.defectRate, 2),
                    detail: `불량 ${num(process.defect)}건 / 실적 ${num(process.actual)}`,
                  }))}
              />
            </Card>
            <Card title="비가동 사유" subtitle="긴 순서이며, 단위는 분입니다.">
              <RankChart items={reasons} />
            </Card>
            <Card title="공정별 비가동 시간" subtitle="긴 순서이며, 단위는 분입니다.">
              <RankChart
                items={[...processes]
                  .sort((a, b) => b.downtime - a.downtime)
                  .map((process) => ({
                    name: process.name,
                    value: process.downtime,
                    label: `${num(process.downtime)}분`,
                    detail: process.reasons.join(", ") || "비가동 없음",
                  }))}
              />
            </Card>

            <Card wide title="공정별 실적과 판정">
              <div className="dash-table-wrap">
                <table className="dash-table" id="process-table">
                  <thead>
                    <tr>
                      <th scope="col">공정</th>
                      <th scope="col">설비</th>
                      <th scope="col">담당자</th>
                      <th scope="col" className="num">계획</th>
                      <th scope="col" className="num">실적</th>
                      <th scope="col" className="num">불량</th>
                      <th scope="col" className="num">비가동(분)</th>
                      <th scope="col" className="num">달성률</th>
                      <th scope="col" className="num">불량률</th>
                      <th scope="col">판정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((process) => (
                      <tr key={process.name}>
                        <td>{process.name}</td>
                        <td>{process.code}</td>
                        <td>{process.owner}</td>
                        <td className="num">{num(process.plan)}</td>
                        <td className="num">{num(process.actual)}</td>
                        <td className="num">{num(process.defect)}</td>
                        <td className="num">{num(process.downtime)}</td>
                        <td className="num">{pct(process.achieve)}</td>
                        <td className="num">{pct(process.defectRate, 2)}</td>
                        <td><StatusChip label={process.status} tone={STATUS_TONE[process.status]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {calibrationCard}

            <section className="dash-card wide">
              <details className="dash-details">
                <summary>일별 수치 표로 보기</summary>
                <div className="dash-table-wrap">
                  <table className="dash-table" id="daily-table">
                    <thead>
                      <tr>
                        <th scope="col">일자</th>
                        <th scope="col" className="num">계획</th>
                        <th scope="col" className="num">실적</th>
                        <th scope="col" className="num">달성률</th>
                        <th scope="col" className="num">불량</th>
                        <th scope="col" className="num">비가동(분)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((day) => (
                        <tr key={day.date}>
                          <td>{longDate(day.date)}</td>
                          <td className="num">{num(day.plan)}</td>
                          <td className="num">{num(day.actual)}</td>
                          <td className="num">{pct(day.achieve)}</td>
                          <td className="num">{num(day.defect)}</td>
                          <td className="num">{num(day.downtime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          </div>
          {footnote}
        </div>
      </div>
    );
  }

  function Loader() {
    const [data, setData] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      fetch(DATA_URL)
        .then((response) => {
          if (!response.ok) throw new Error("load failed");
          return response.json();
        })
        .then(setData)
        .catch(() => setFailed(true));
    }, []);

    if (failed) {
      return <p className="dash-message" role="alert">데이터를 불러오지 못했습니다. Live Server로 public/index.html을 열었는지 확인해 주세요.</p>;
    }
    if (!data) return <p className="dash-message" role="status">데이터를 불러오는 중입니다...</p>;
    return <Dashboard data={data} />;
  }

  ReactDOM.createRoot(document.getElementById("dashboard")).render(<Loader />);
})();
