export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

export type EmailStatus = "scheduled" | "processing" | "sent" | "failed" | "rescheduled";

export interface EmailRow {
  id: string;
  recipient_email: string;
  subject: string;
  scheduled_time: string;
  sent_at: string | null;
  status: EmailStatus;
  sender_id: string;
  error_message: string | null;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
}

export interface ScheduleFormData {
  subject: string;
  body: string;
  senderId: string;
  startTime: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  recipients: string[];
}
