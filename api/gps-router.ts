// =============================================================================
// GPS INTELLIGENCE ROUTER — P0-07: Delay Detection (15-min warning)
// Tracks mobile clinic vehicles, detects delivery risk, fires alerts
// =============================================================================
import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GpsPosition {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number; // km/h
  heading: number; // degrees
  timestamp: Date;
  address: string;
}

interface Appointment {
  id: string;
  vehicleId: string;
  clientName: string;
  address: string;
  scheduledAt: Date;
  estimatedArrival: Date | null;
  status: "SCHEDULED" | "EN_ROUTE" | "ARRIVED" | "COMPLETED" | "DELAYED";
  delayMinutes: number;
  lat: number;
  lng: number;
  distanceKm: number;
}

interface DelayAlert {
  appointmentId: string;
  vehicleId: string;
  clientName: string;
  scheduledAt: Date;
  estimatedArrival: Date;
  delayMinutes: number;
  severity: "WARNING" | "CRITICAL";
  message: string;
  messageAr: string;
}

// Pilot GPS Data — 5 Mobile Clinic Vehicles

const positions: Map<string, GpsPosition> = new Map([
  ["MC-001", { vehicleId: "MC-001", lat: 24.6877, lng: 46.7219, speed: 45, heading: 90, timestamp: new Date(), address: "طريق الملك عبدالعزيز، الرياض" }],
  ["MC-002", { vehicleId: "MC-002", lat: 24.7136, lng: 46.6753, speed: 0, heading: 0, timestamp: new Date(), address: "حي العليا، الرياض" }],
  ["MC-003", { vehicleId: "MC-003", lat: 24.6511, lng: 46.7198, speed: 60, heading: 270, timestamp: new Date(), address: "طريق الدائري الجنوبي، الرياض" }],
  ["MC-004", { vehicleId: "MC-004", lat: 24.7747, lng: 46.7386, speed: 30, heading: 180, timestamp: new Date(), address: "حي الروضة، الرياض" }],
  ["MC-005", { vehicleId: "MC-005", lat: 24.6249, lng: 46.6931, speed: 50, heading: 45, timestamp: new Date(), address: "طريق الخرج، الرياض" }],
]);

// Upcoming appointments for today (mocked for pilot)
const now = new Date();
const appointments: Appointment[] = [
  { id: "APT-001", vehicleId: "MC-001", clientName: "مزرعة الفيصل", address: "حي المروج", scheduledAt: new Date(now.getTime() + 20 * 60000), estimatedArrival: new Date(now.getTime() + 38 * 60000), status: "EN_ROUTE", delayMinutes: 18, lat: 24.7500, lng: 46.7100, distanceKm: 12.5 },
  { id: "APT-002", vehicleId: "MC-002", clientName: "مزرعة النخيل", address: "حي الحمراء", scheduledAt: new Date(now.getTime() + 45 * 60000), estimatedArrival: new Date(now.getTime() + 50 * 60000), status: "SCHEDULED", delayMinutes: 5, lat: 24.6900, lng: 46.6500, distanceKm: 8.3 },
  { id: "APT-003", vehicleId: "MC-003", clientName: "مزرعة الغروب", address: "حي الياسمين", scheduledAt: new Date(now.getTime() + 15 * 60000), estimatedArrival: new Date(now.getTime() + 35 * 60000), status: "EN_ROUTE", delayMinutes: 20, lat: 24.6300, lng: 46.7300, distanceKm: 6.1 },
  { id: "APT-004", vehicleId: "MC-004", clientName: "مركز التربية الحيوانية", address: "حي النسيم", scheduledAt: new Date(now.getTime() + 60 * 60000), estimatedArrival: new Date(now.getTime() + 58 * 60000), status: "SCHEDULED", delayMinutes: -2, lat: 24.7800, lng: 46.7600, distanceKm: 4.2 },
  { id: "APT-005", vehicleId: "MC-005", clientName: "مزرعة الربيع", address: "حي الشفا", scheduledAt: new Date(now.getTime() + 30 * 60000), estimatedArrival: new Date(now.getTime() + 52 * 60000), status: "EN_ROUTE", delayMinutes: 22, lat: 24.6100, lng: 46.6700, distanceKm: 15.8 },
];

const alerts: DelayAlert[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Delay Detection Engine
// ─────────────────────────────────────────────────────────────────────────────

function detectDelays(): DelayAlert[] {
  const active: DelayAlert[] = [];
  for (const apt of appointments) {
    if (apt.status === "COMPLETED" || apt.status === "ARRIVED") continue;
    if (apt.delayMinutes >= 15) {
      const severity: "WARNING" | "CRITICAL" = apt.delayMinutes >= 30 ? "CRITICAL" : "WARNING";
      const alert: DelayAlert = {
        appointmentId: apt.id,
        vehicleId: apt.vehicleId,
        clientName: apt.clientName,
        scheduledAt: apt.scheduledAt,
        estimatedArrival: apt.estimatedArrival!,
        delayMinutes: apt.delayMinutes,
        severity,
        message: `Vehicle ${apt.vehicleId} may be ${apt.delayMinutes}min late for ${apt.clientName}`,
        messageAr: `المركبة ${apt.vehicleId} قد تتأخر ${apt.delayMinutes} دقيقة عن ${apt.clientName}`,
      };
      active.push(alert);
      // Deduplicate in alerts store
      if (!alerts.find((a) => a.appointmentId === apt.id)) {
        alerts.push(alert);
      }
    }
  }
  return active;
}

// Auto-run delay detection every 60s
setInterval(detectDelays, 60000);
detectDelays(); // Initial run

// ─────────────────────────────────────────────────────────────────────────────
// GPS Router
// ─────────────────────────────────────────────────────────────────────────────

export const gpsRouter = createRouter({
  // GPS-01: positions — All vehicle positions
  positions: publicQuery.query(() =>
    Array.from(positions.values()).map((p) => ({
      vehicleId: p.vehicleId,
      lat: p.lat,
      lng: p.lng,
      speed: p.speed,
      heading: p.heading,
      address: p.address,
      lastUpdate: p.timestamp,
    }))
  ),

  // GPS-02: position — Single vehicle position
  position: publicQuery
    .input(z.object({ vehicleId: z.string() }))
    .query(({ input }) => {
      const pos = positions.get(input.vehicleId);
      if (!pos) throw new Error("VEHICLE_NOT_FOUND");
      return pos;
    }),

  // GPS-03: update — Update vehicle position (mobile app → server)
  update: publicQuery
    .input(z.object({
      vehicleId: z.string(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      speed: z.number().min(0).max(200).default(0),
      heading: z.number().min(0).max(360).default(0),
      address: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const existing = positions.get(input.vehicleId);
      positions.set(input.vehicleId, {
        vehicleId: input.vehicleId,
        lat: input.lat,
        lng: input.lng,
        speed: input.speed,
        heading: input.heading,
        address: input.address ?? existing?.address ?? "",
        timestamp: new Date(),
      });
      // Recompute delays after position update
      const activeAlerts = detectDelays();
      return { updated: true, vehicleId: input.vehicleId, activeAlerts: activeAlerts.length };
    }),

  // GPS-04: appointments — All appointments with delay status
  appointments: publicQuery.query(() =>
    appointments.map((a) => ({
      id: a.id,
      vehicleId: a.vehicleId,
      clientName: a.clientName,
      address: a.address,
      scheduledAt: a.scheduledAt,
      estimatedArrival: a.estimatedArrival,
      status: a.status,
      delayMinutes: a.delayMinutes,
      atRisk: a.delayMinutes >= 15,
      distanceKm: a.distanceKm,
    }))
  ),

  // GPS-05: alerts — Active delay alerts (P0-07 core)
  alerts: publicQuery.query(() => {
    const active = detectDelays();
    return {
      total: active.length,
      critical: active.filter((a) => a.severity === "CRITICAL").length,
      warnings: active.filter((a) => a.severity === "WARNING").length,
      alerts: active,
      allTime: alerts.length,
    };
  }),

  // GPS-06: checkDelay — Check single appointment delay risk
  checkDelay: publicQuery
    .input(z.object({ appointmentId: z.string() }))
    .query(({ input }) => {
      const apt = appointments.find((a) => a.id === input.appointmentId);
      if (!apt) throw new Error("APPOINTMENT_NOT_FOUND");
      const atRisk = apt.delayMinutes >= 15;
      return {
        appointmentId: apt.id,
        vehicleId: apt.vehicleId,
        clientName: apt.clientName,
        scheduledAt: apt.scheduledAt,
        estimatedArrival: apt.estimatedArrival,
        delayMinutes: apt.delayMinutes,
        atRisk,
        severity: apt.delayMinutes >= 30 ? "CRITICAL" : apt.delayMinutes >= 15 ? "WARNING" : "OK",
        recommendation: atRisk
          ? `ابلغ العميل بالتأخير المتوقع (${apt.delayMinutes} دقيقة)`
          : "الوصول في الوقت المحدد ✅",
      };
    }),

  // GPS-07: stats — Fleet statistics
  stats: publicQuery.query(() => {
    const pos = Array.from(positions.values());
    const activeAlerts = detectDelays();
    return {
      totalVehicles: pos.length,
      movingVehicles: pos.filter((p) => p.speed > 0).length,
      stoppedVehicles: pos.filter((p) => p.speed === 0).length,
      totalAppointments: appointments.length,
      onTimeAppointments: appointments.filter((a) => a.delayMinutes < 15).length,
      delayedAppointments: appointments.filter((a) => a.delayMinutes >= 15).length,
      activeAlerts: activeAlerts.length,
      avgDelay: Math.round(appointments.reduce((s, a) => s + Math.max(0, a.delayMinutes), 0) / appointments.length),
    };
  }),
});
