/** Shape of a Twilio WhatsApp inbound webhook (subset). */
export interface TwilioWebhookPayload {
  MessageSid?: string;
  SmsSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
  ProfileName?: string;
  MessageStatus?: string;
  SmsStatus?: string;
  [key: string]: unknown;
}
