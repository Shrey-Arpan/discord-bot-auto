export interface ScheduledMessage {
  id: string;
  userId: string;
  channelId: string;
  message: string;
  scheduledTime: string; // ISO 8601
  createdAt: string; // ISO 8601
  status: 'pending' | 'sent' | 'cancelled';
}
