import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export interface TimeSlot {
  start: Date;
  end: Date;
  veterinarianId: string;
  available: boolean;
  reason?: string; // e.g., "lunch break", "existing appointment", "optimal"
}

export interface OptimizedDay {
  date: string;
  totalSlots: number;
  availableSlots: number;
  utilizationRate: number;
  recommendations: string[];
}

@Injectable()
export class SmartSchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async suggestSlots(workspaceId: string, date: Date, duration: number = 30, veterinarianId?: string): Promise<TimeSlot[]> {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0, 0);  // 8 AM
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 0, 0);   // 6 PM
    const slotDuration = duration; // minutes

    // Get all appointments for the day
    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        workspaceId,
        date: { gte: dayStart, lt: dayEnd },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      orderBy: { date: 'asc' },
    });

    // Filter by veterinarian if specified
    const filteredAppts = veterinarianId
      ? existingAppointments.filter(a => a.veterinarianId === veterinarianId)
      : existingAppointments;

    // Generate candidate slots
    const slots: TimeSlot[] = [];
    let current = new Date(dayStart);

    while (current.getTime() + slotDuration * 60000 <= dayEnd.getTime()) {
      const slotEnd = new Date(current.getTime() + slotDuration * 60000);

      // Check for conflicts
      const conflict = filteredAppts.find(a => {
        const aStart = new Date(a.date).getTime();
        const aEnd = aStart + (a.duration || 30) * 60000;
        return (current.getTime() < aEnd && slotEnd.getTime() > aStart);
      });

      slots.push({
        start: new Date(current),
        end: slotEnd,
        veterinarianId: veterinarianId || 'any',
        available: !conflict,
        reason: conflict ? `Booked: ${conflict.title}` : 'Available',
      });

      current = new Date(current.getTime() + 15 * 60000); // 15-minute increments
    }

    return slots;
  }

  async optimizeDay(workspaceId: string, date: Date): Promise<OptimizedDay> {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0);

    const [totalAppointments, byType, byStatus] = await Promise.all([
      this.prisma.appointment.count({ where: { workspaceId, date: { gte: dayStart, lt: dayEnd } } }),
      this.prisma.appointment.groupBy({ by: ['type'], where: { workspaceId, date: { gte: dayStart, lt: dayEnd } }, _count: { type: true } }),
      this.prisma.appointment.groupBy({ by: ['status'], where: { workspaceId, date: { gte: dayStart, lt: dayEnd } }, _count: { status: true } }),
    ]);

    const totalSlots = 40; // 8-hour day, 15-min slots
    const utilizationRate = totalSlots > 0 ? Math.round((totalAppointments / totalSlots) * 100) : 0;

    const recommendations: string[] = [];
    if (utilizationRate > 85) recommendations.push('High utilization — consider extending hours or adding veterinarian');
    if (utilizationRate < 30) recommendations.push('Low utilization — consider promotional campaigns');

    const surgeryCount = byType.find(t => t.type === 'SURGERY')?._count.type || 0;
    if (surgeryCount > 3) recommendations.push('Multiple surgeries scheduled — ensure adequate prep time');

    const cancelledCount = byStatus.find(s => s.status === 'CANCELLED')?._count.status || 0;
    if (cancelledCount > 2) recommendations.push(`${cancelledCount} cancellations — consider waitlist feature`);

    return {
      date: date.toISOString().split('T')[0],
      totalSlots,
      availableSlots: totalSlots - totalAppointments,
      utilizationRate,
      recommendations,
    };
  }

  async autoBook(body: { patientId: string; preferredDates: string[]; duration: number; type: string; veterinarianId?: string; notes?: string }, workspaceId: string, createdBy?: string) {
    // Try each preferred date in order
    for (const dateStr of body.preferredDates) {
      const slots = await this.suggestSlots(workspaceId, new Date(dateStr), body.duration, body.veterinarianId);
      const availableSlot = slots.find(s => s.available);

      if (availableSlot) {
        const appointment = await this.prisma.appointment.create({
          data: {
            patientId: body.patientId,
            title: `${body.type} — Auto-booked`,
            date: availableSlot.start,
            duration: body.duration,
            status: 'SCHEDULED',
            type: body.type as any,
            notes: body.notes || `Auto-booked by AI scheduling. Preferred dates: ${body.preferredDates.join(', ')}`,
            veterinarianId: body.veterinarianId,
            workspaceId,
          },
        });

        return {
          success: true,
          appointmentId: appointment.id,
          scheduledAt: availableSlot.start,
          message: `Appointment auto-booked for ${dateStr} at ${availableSlot.start.toLocaleTimeString()}`,
        };
      }
    }

    return {
      success: false,
      message: 'No available slots found for preferred dates. Please choose alternative dates.',
    };
  }
}
