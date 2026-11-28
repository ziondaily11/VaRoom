'use strict';

// Calendar reminders (docs/host-controls/CALENDAR_PLAN.md, part 6): each hour
// the server asks calendar_reminders_due what hosts should hear about and
// sends each as a 'calendar_reminder' notification. Tomorrow's check-ins,
// move-ins, viewings and events go out in the evening (from 17:00 Nairobi
// time); a lease ending in 60 days whenever it's due. Each has its own event
// key, so it's sent once however often the job runs, and the host's
// "Reminders" setting decides whether it's kept (varoom_notification_wanted).

const { createNotification } = require('./notifications');

const REMINDER_INTERVAL_MS = 60 * 60 * 1000;
const EVENING_HOUR = 17;

const nairobiHour = (now) => (now.getUTCHours() + 3) % 24;

async function sendCalendarReminders(admin, now = new Date(), notify = createNotification) {
  const { data, error } = await admin.rpc('calendar_reminders_due', { p_tomorrow: nairobiHour(now) >= EVENING_HOUR });
  if (error) throw error;
  let sent = 0;
  for (const reminder of data || []) {
    try {
      await notify({
        supabase: admin, recipientUserId: reminder.host_id, type: 'calendar_reminder', title: reminder.title, message: reminder.message,
        relatedEntityType: reminder.listing_id ? 'listing' : null, relatedEntityId: reminder.listing_id || null, eventKey: reminder.event_key,
      });
      sent += 1;
    } catch (failure) {
      console.error('Calendar reminder failed:', reminder.event_key, failure && failure.message);
    }
  }
  return sent;
}

module.exports = { REMINDER_INTERVAL_MS, EVENING_HOUR, nairobiHour, sendCalendarReminders };
