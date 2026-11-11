/** «График приходов»: во сколько сотрудники приходят и как день выглядит по
 * людям — план смены против фактических отметок.
 *
 * Всё время — по Астане (UTC+5), как его считает учёт, а не по часовому поясу
 * компьютера. Опоздание — то, что посчитал сервер по правилам учёта
 * (`late_minutes > 0`), а не «пришёл позже начала».
 *
 * Цвета: «вовремя» — синий, «с опозданием» — оранжевый (палитра проверена на
 * различимость, в том числе при дальтонизме); план смены — нейтральная серая
 * полоса. У каждого графика есть легенда и подсказка при наведении. */
import { Card, DatePicker, Empty, Segmented, Space, Spin, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchAllPages } from "@/api/client";
import {
  listAbsences, listShifts,
  type AttendanceAbsenceOut, type AttendanceShiftOut,
} from "@/api/attendance";
import { toBusiness } from "@/components/format";

const C = {
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  onTime: "#2a78d6",
  late: "#eb6834",
  plan: "#f0efec",
};

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Минуты от полуночи дня `day` по Астане (у ночной смены — больше 1440). */
function minutesOf(iso: string, day: Dayjs): number {
  const t = toBusiness(iso);
  const base = dayjs(day.format("YYYY-MM-DD")).utcOffset(300, true).startOf("day");
  return Math.round(t.diff(base, "minute", true));
}

function hhmm(m: number): string {
  const mm = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
}

function Legend({ items }: { items: { color: string; label: string; outline?: boolean }[] }) {
  return (
    <Space size={16} wrap style={{ fontSize: 12, color: C.ink2 }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 12, height: 12, borderRadius: 3, background: i.color,
            border: i.outline ? `1px solid ${C.axis}` : undefined, display: "inline-block",
          }} />
          {i.label}
        </span>
      ))}
    </Space>
  );
}

interface Tip { x: number; y: number; lines: string[] }

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div style={{
      position: "absolute", left: tip.x + 12, top: tip.y + 12, pointerEvents: "none",
      background: "#fff", border: "1px solid rgba(11,11,11,0.10)", borderRadius: 8,
      boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: "6px 10px", fontSize: 12,
      color: C.ink, zIndex: 10, whiteSpace: "nowrap",
    }}>
      {tip.lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 600 } : { color: C.ink2 }}>{l}</div>)}
    </div>
  );
}

/** Гистограмма: сколько приходов в каждом интервале, вовремя и с опозданием. */
function ArrivalsHistogram({ shifts }: { shifts: AttendanceShiftOut[] }) {
  const [step, setStep] = useState(30);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);

  const data = useMemo(() => {
    const arrivals = shifts.map((s) => {
      const t = toBusiness(s.clock_in_at);
      return { m: t.hour() * 60 + t.minute(), late: (s.late_minutes ?? 0) > 0 };
    });
    if (!arrivals.length) return null;
    const lo = Math.floor(Math.min(...arrivals.map((a) => a.m)) / step) * step;
    const hi = Math.ceil((Math.max(...arrivals.map((a) => a.m)) + 1) / step) * step;
    const buckets: { from: number; onTime: number; late: number }[] = [];
    for (let b = lo; b < hi; b += step) buckets.push({ from: b, onTime: 0, late: 0 });
    for (const a of arrivals) {
      const b = buckets[Math.floor((a.m - lo) / step)];
      if (a.late) b.late += 1;
      else b.onTime += 1;
    }
    const late = arrivals.filter((a) => a.late).length;
    const avg = arrivals.reduce((s, a) => s + a.m, 0) / arrivals.length;
    return { buckets, total: arrivals.length, late, avg };
  }, [shifts, step]);

  if (!data) return <Empty description="Отметок прихода за период нет" />;
  const H = 220, padL = 36, padR = 8, padT = 8, padB = 28;
  const plotW = width - padL - padR, plotH = H - padT - padB;
  const max = Math.max(1, ...data.buckets.map((b) => b.onTime + b.late));
  const yTicks = Array.from(new Set([0, Math.ceil(max / 2), max]));
  const bw = plotW / data.buckets.length;
  const barW = Math.max(2, Math.min(36, bw - 6));
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(data.buckets.length / Math.max(1, Math.floor(plotW / 56)));

  return (
    <div>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }} wrap>
        <Typography.Text style={{ color: C.ink2 }}>
          Приходов: <b style={{ color: C.ink }}>{data.total}</b> · с опозданием:{" "}
          <b style={{ color: C.ink }}>{data.late}</b> ({Math.round((data.late / data.total) * 100)}%) ·
          средний приход: <b style={{ color: C.ink }}>{hhmm(data.avg)}</b>
        </Typography.Text>
        <Segmented size="small" value={step} onChange={(v) => setStep(Number(v))}
          options={[{ value: 15, label: "15 мин" }, { value: 30, label: "30 мин" }, { value: 60, label: "1 час" }]} />
      </Space>
      <Legend items={[{ color: C.onTime, label: "Вовремя" }, { color: C.late, label: "С опозданием" }]} />
      <div ref={ref} style={{ position: "relative", marginTop: 8 }} onMouseLeave={() => setTip(null)}>
        <svg width={width} height={H} role="img" aria-label="Распределение приходов по времени">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.axis : C.grid} strokeWidth={1} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={C.muted}>{t}</text>
            </g>
          ))}
          {data.buckets.map((b, i) => {
            const x = padL + i * bw + (bw - barW) / 2;
            const hOn = (b.onTime / max) * plotH;
            const hLate = (b.late / max) * plotH;
            const gap = b.onTime && b.late ? 2 : 0;
            const r = Math.min(4, barW / 2);
            const lines = [`${hhmm(b.from)}–${hhmm(b.from + step)}`, `вовремя: ${b.onTime}`, `с опозданием: ${b.late}`];
            return (
              <g key={b.from}>
                {/* Ширина цели наведения — весь интервал, а не только столбец. */}
                <rect x={padL + i * bw} y={padT} width={bw} height={plotH} fill="transparent"
                  onMouseMove={(e) => {
                    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, lines });
                  }} />
                {b.onTime > 0 && (
                  <path pointerEvents="none" fill={C.onTime} d={b.late
                    ? `M${x},${y(0)} v${-hOn} h${barW} v${hOn} z`
                    : `M${x},${y(0)} v${-(hOn - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${hOn - r} z`} />
                )}
                {b.late > 0 && (
                  <path pointerEvents="none" fill={C.late}
                    d={`M${x},${y(0) - hOn - gap} v${-(hLate - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${hLate - r} z`} />
                )}
                {i % labelEvery === 0 && (
                  <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={C.muted}>
                    {hhmm(b.from)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );
}

interface Row {
  key: string;
  name: string;
  planFrom: number | null;
  planTo: number | null;
  inAt: number | null;
  outAt: number | null;
  open: boolean;
  lateMin: number;
  shiftName: string | null;
  absent?: string;
}

/** День по сотрудникам: серая полоса — план смены, синяя — от прихода до
 * ухода, оранжевая — опоздание (от начала смены до прихода). */
function DayTimeline({ day, shifts, absences }: {
  day: Dayjs;
  shifts: AttendanceShiftOut[];
  absences: AttendanceAbsenceOut[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const isToday = day.isSame(toBusiness(dayjs().toISOString()), "day");
  const now = minutesOf(dayjs().toISOString(), day);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = shifts.map((s) => ({
      key: `s${s.attendance_shift_id}`,
      name: s.employee_name ?? `#${s.employee_id}`,
      planFrom: s.scheduled_start ? minutesOf(s.scheduled_start, day) : null,
      planTo: s.scheduled_end ? minutesOf(s.scheduled_end, day) : null,
      inAt: minutesOf(s.clock_in_at, day),
      outAt: s.clock_out_at ? minutesOf(s.clock_out_at, day) : null,
      open: s.status === "open",
      lateMin: s.late_minutes ?? 0,
      shiftName: s.shift_name,
    }));
    for (const a of absences) {
      out.push({
        key: `a${a.absence_id}`, name: a.employee_name ?? `#${a.employee_id}`,
        planFrom: a.scheduled_start ? minutesOf(a.scheduled_start, day) : null,
        planTo: a.scheduled_start ? minutesOf(a.scheduled_start, day) + 8 * 60 : null,
        inAt: null, outAt: null, open: false, lateMin: 0, shiftName: null,
        absent: a.status === "excused" ? "уважительная неявка" : "неявка",
      });
    }
    return out.sort((x, y) => (x.inAt ?? x.planFrom ?? 9e9) - (y.inAt ?? y.planFrom ?? 9e9));
  }, [shifts, absences, day]);

  if (!rows.length) return <Empty description="В этот день отметок нет" />;
  const points = rows.flatMap((r) => [r.planFrom, r.planTo, r.inAt, r.outAt ?? (r.open ? now : null)])
    .filter((v): v is number => v != null);
  const lo = Math.max(-120, Math.floor((Math.min(...points) - 30) / 60) * 60);
  const hi = Math.min(36 * 60, Math.ceil((Math.max(...points) + 30) / 60) * 60);
  const nameW = Math.min(200, Math.max(120, width * 0.22));
  const padR = 90, rowH = 26, padT = 22;
  const plotW = Math.max(100, width - nameW - padR);
  const x = (m: number) => nameW + ((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo)) * plotW;
  const H = padT + rows.length * rowH + 8;
  const hours: number[] = [];
  const hourStep = (hi - lo) / 60 > 14 ? 120 : 60;
  for (let m = lo; m <= hi; m += hourStep) hours.push(m);

  return (
    <div>
      <Legend items={[
        { color: C.plan, label: "План смены", outline: true },
        { color: C.onTime, label: "На смене (приход → уход)" },
        { color: C.late, label: "Опоздание" },
      ]} />
      <div ref={ref} style={{ position: "relative", marginTop: 8, overflowX: "auto" }} onMouseLeave={() => setTip(null)}>
        <svg width={width} height={H} role="img" aria-label="Приходы и уходы сотрудников за день">
          {hours.map((m) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={padT - 4} y2={H - 6} stroke={C.grid} strokeWidth={1} />
              <text x={x(m)} y={12} textAnchor="middle" fontSize={11} fill={C.muted}>{hhmm(m)}</text>
            </g>
          ))}
          {isToday && now > lo && now < hi && (
            <g>
              <line x1={x(now)} x2={x(now)} y1={padT - 6} y2={H - 6} stroke={C.ink2} strokeDasharray="3 3" strokeWidth={1} />
              <text x={x(now) + 4} y={padT - 8} fontSize={10} fill={C.ink2}>сейчас</text>
            </g>
          )}
          {rows.map((r, i) => {
            const cy = padT + i * rowH + rowH / 2;
            const end = r.outAt ?? (r.open ? now : r.inAt);
            const lines = [
              r.name,
              r.planFrom != null ? `план: ${hhmm(r.planFrom)}–${r.planTo != null ? hhmm(r.planTo) : "?"}${r.shiftName ? ` (${r.shiftName})` : ""}` : "без плана",
              r.absent ? r.absent : `приход ${r.inAt != null ? hhmm(r.inAt) : "—"}${r.lateMin ? `, опоздание ${r.lateMin} мин` : ""}`,
              ...(r.absent ? [] : [r.outAt != null ? `уход ${hhmm(r.outAt)}` : r.open ? "ещё на смене" : "ухода нет"]),
            ];
            return (
              <g key={r.key}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, lines });
                }}>
                <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill={i % 2 ? "#fafaf8" : "transparent"} />
                <text x={nameW - 8} y={cy + 4} textAnchor="end" fontSize={12} fill={C.ink2}>
                  {r.name.length > 26 ? `${r.name.slice(0, 25)}…` : r.name}
                </text>
                {r.planFrom != null && r.planTo != null && (
                  <rect x={x(r.planFrom)} y={cy - 8} width={Math.max(2, x(r.planTo) - x(r.planFrom))} height={16}
                    rx={4} fill={C.plan} stroke={C.axis} strokeWidth={1} />
                )}
                {r.inAt != null && r.planFrom != null && r.lateMin > 0 && (
                  <rect x={x(r.planFrom)} y={cy - 3} width={Math.max(2, x(r.inAt) - x(r.planFrom) - 2)} height={6}
                    rx={3} fill={C.late} />
                )}
                {r.inAt != null && end != null && (
                  <rect x={x(r.inAt)} y={cy - 4} width={Math.max(4, x(end) - x(r.inAt))} height={8} rx={4}
                    fill={C.onTime} fillOpacity={r.open ? 0.75 : 1} />
                )}
                <text x={width - padR + 8} y={cy + 4} fontSize={11} fill={r.absent ? C.late : C.muted}>
                  {r.absent ? r.absent : `${r.inAt != null ? hhmm(r.inAt) : "—"}–${r.outAt != null ? hhmm(r.outAt) : r.open ? "…" : "—"}`}
                </text>
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </div>
  );
}

export default function ArrivalsCharts() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(13, "day"), dayjs()]);
  const [day, setDay] = useState<Dayjs>(dayjs());
  const from = range[0].format("YYYY-MM-DD");
  const to = range[1].format("YYYY-MM-DD");
  const dayKey = day.format("YYYY-MM-DD");

  const period = useQuery({
    queryKey: ["arrivals", from, to],
    queryFn: () => fetchAllPages((p) => listShifts({ ...p, from, to })),
  });
  const dayShifts = useQuery({
    queryKey: ["arrivals-day", dayKey],
    queryFn: () => fetchAllPages((p) => listShifts({ ...p, from: dayKey, to: dayKey })),
    refetchInterval: 60_000,
  });
  const dayAbsences = useQuery({
    queryKey: ["arrivals-day-absences", dayKey],
    queryFn: () => listAbsences({ from: dayKey, to: dayKey }),
  });

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small" title="Во сколько приходят"
        extra={<DatePicker.RangePicker allowClear={false} format="DD.MM.YYYY" value={range}
          onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])} />}>
        {period.isPending ? <Spin /> : <ArrivalsHistogram shifts={period.data ?? []} />}
      </Card>
      <Card size="small" title="День по сотрудникам: план и факт"
        extra={<DatePicker allowClear={false} format="DD.MM.YYYY" value={day} onChange={(v) => v && setDay(v)} />}>
        {dayShifts.isPending ? <Spin /> : (
          <DayTimeline day={day} shifts={dayShifts.data ?? []} absences={dayAbsences.data ?? []} />
        )}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: "8px 0 0" }}>
          Время — по Астане (UTC+5). Опоздание считает учёт по порогу из «Правил учёта».
        </Typography.Paragraph>
      </Card>
    </Space>
  );
}
