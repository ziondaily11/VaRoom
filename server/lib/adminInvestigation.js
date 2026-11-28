'use strict';

// Admin investigation (migration 20261129_000099): everything about one
// account on one page, search across accounts, listings, tickets and
// payments, and reading a conversation only once it has been reported.

const { effectiveStatus } = require('./enforcement');
const { decryptMessage } = require('./messageEncryptionService');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every result, or the first error. */
async function all(queries) {
  const results = await Promise.all(queries);
  const failed = results.find((result) => result && result.error);
  if (failed) throw failed.error;
  return results;
}

/** { id: name } for profiles, and { id: status } for their accounts. */
async function people(admin, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { names: {}, statuses: {} };
  const [profiles, controls] = await all([
    admin.from('profiles').select('id,full_name,username').in('id', unique),
    admin.from('account_controls').select('user_id,status,suspended_until').in('user_id', unique),
  ]);
  return {
    names: Object.fromEntries((profiles.data || []).map((p) => [p.id, p.full_name || p.username || null])),
    statuses: Object.fromEntries((controls.data || []).map((c) => [c.user_id, effectiveStatus(c)])),
  };
}

const PROFILE_COLUMNS = 'id,role,full_name,username,phone,city,host_type,business_name,verified,created_at,deactivated_at,deletion_scheduled_for';

/** The whole picture of one account, or null when there is no such user. */
async function accountOverview(admin, userId) {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData || !userData.user) return null;
  const authUser = userData.user;
  const recent = (query) => query.order('created_at', { ascending: false }).limit(10);
  const [profile, control, listings, hostBookings, guestBookings, group, teamsOwned, teamsJoined, filedChat, receivedChat, filedListing,
    ticketsById, ticketsByEmail, subscriptions, payments, ledger, actions, notes, activity, documents] = await all([
    admin.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
    admin.from('account_controls').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('listings').select('id,title,category,created_at,availability_status,moderation_status,moderation_reason,publication_state').eq('host_id', userId).order('created_at', { ascending: false }),
    recent(admin.from('bookings').select('id,listing_id,client_id,status,total_price,start_date,created_at', { count: 'exact' }).eq('host_id', userId)),
    recent(admin.from('bookings').select('id,listing_id,host_id,status,total_price,start_date,created_at', { count: 'exact' }).eq('client_id', userId)),
    admin.from('account_group_members').select('group_id').eq('user_id', userId).maybeSingle(),
    admin.from('host_team_members').select('host_id,member_id,roles,status,accepted_at').eq('host_id', userId),
    admin.from('host_team_members').select('host_id,member_id,roles,status,accepted_at').eq('member_id', userId),
    recent(admin.from('chat_user_reports').select('id,reported_user_id,conversation_id,reason,details,status,created_at').eq('reporter_user_id', userId)),
    recent(admin.from('chat_user_reports').select('id,reporter_user_id,conversation_id,reason,details,status,created_at').eq('reported_user_id', userId)),
    recent(admin.from('listing_reports').select('id,listing_id,reason,details,status,created_at').eq('reporter_user_id', userId)),
    recent(admin.from('support_tickets').select('id,subject,status,category,source,created_at').eq('user_id', userId)),
    authUser.email ? recent(admin.from('support_tickets').select('id,subject,status,category,source,created_at').eq('email', authUser.email.toLowerCase())) : { data: [] },
    admin.from('host_subscriptions').select('id,plan_id,niche,status,current_period_end,cancel_at_period_end,created_at,comp:provider_metadata->comp').eq('host_id', userId).order('created_at', { ascending: false }),
    recent(admin.from('billing_payments').select('id,payment_kind,plan_id,amount_minor,currency,status,provider_reference,paid_at,vcoins,created_at').eq('host_id', userId)),
    admin.from('elie_ledger').select('delta,kind,created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    admin.from('account_enforcement_actions').select('id,action,reason,rule_key,suspended_until,created_at,admin:admins(name)').eq('user_id', userId).order('created_at', { ascending: false }),
    admin.from('admin_notes').select('id,body,created_at,admin:admins(name)').eq('user_id', userId).order('created_at', { ascending: false }),
    admin.from('admin_activity').select('id,action,reason,created_at,admin:admins(name)').eq('target_id', userId).order('created_at', { ascending: false }).limit(50),
    admin.from('listing_documents').select('id,listing_id,document_type,original_filename,visibility,created_at')
      .eq('host_id', userId).eq('status', 'ready').is('deleted_at', null).order('created_at', { ascending: false }),
  ]);

  const listingIds = (listings.data || []).map((l) => l.id);
  const [groupMembers, reportsOnListings] = await all([
    group.data ? admin.from('account_group_members').select('user_id').eq('group_id', group.data.group_id).neq('user_id', userId) : { data: [] },
    listingIds.length ? recent(admin.from('listing_reports').select('id,listing_id,reporter_user_id,reason,details,status,created_at').in('listing_id', listingIds)) : { data: [] },
  ]);
  const linkedIds = (groupMembers.data || []).map((m) => m.user_id);
  const team = [...(teamsOwned.data || []).map((t) => ({ ...t, as: 'owner', other_id: t.member_id })), ...(teamsJoined.data || []).map((t) => ({ ...t, as: 'member', other_id: t.host_id }))];
  const { names, statuses } = await people(admin, [
    ...linkedIds, ...team.map((t) => t.other_id),
    ...(filedChat.data || []).map((r) => r.reported_user_id), ...(receivedChat.data || []).map((r) => r.reporter_user_id),
    ...(reportsOnListings.data || []).map((r) => r.reporter_user_id),
    ...(hostBookings.data || []).map((b) => b.client_id), ...(guestBookings.data || []).map((b) => b.host_id),
  ]);
  const titles = Object.fromEntries((listings.data || []).map((l) => [l.id, l.title]));
  const tickets = [...new Map([...(ticketsById.data || []), ...(ticketsByEmail.data || [])].map((t) => [t.id, t])).values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const name = (id) => names[id] || null;

  return {
    user: {
      id: authUser.id, email: authUser.email, created_at: authUser.created_at, last_sign_in_at: authUser.last_sign_in_at,
      provider: (authUser.app_metadata && authUser.app_metadata.provider) || 'email',
      profile: profile.data || null,
      account: control.data ? { ...control.data, status: effectiveStatus(control.data) } : { status: 'active' },
    },
    linked: linkedIds.map((id) => ({ id, name: name(id), status: statuses[id] || 'active' })),
    team: team.map((t) => ({ as: t.as, id: t.other_id, name: name(t.other_id), roles: t.roles, status: t.status })),
    listings: listings.data || [],
    bookings: {
      asHost: { count: hostBookings.count || 0, recent: (hostBookings.data || []).map((b) => ({ ...b, listing: titles[b.listing_id] || null, other: name(b.client_id), other_id: b.client_id })) },
      asGuest: { count: guestBookings.count || 0, recent: (guestBookings.data || []).map((b) => ({ ...b, other: name(b.host_id), other_id: b.host_id })) },
    },
    reports: {
      received: (receivedChat.data || []).map((r) => ({ ...r, other: name(r.reporter_user_id), other_id: r.reporter_user_id })),
      filed: (filedChat.data || []).map((r) => ({ ...r, other: name(r.reported_user_id), other_id: r.reported_user_id })),
      onListings: (reportsOnListings.data || []).map((r) => ({ ...r, listing: titles[r.listing_id] || null, other: name(r.reporter_user_id), other_id: r.reporter_user_id })),
      filedOnListings: filedListing.data || [],
    },
    tickets,
    billing: { subscriptions: subscriptions.data || [], payments: payments.data || [] },
    vcoins: { balance: (ledger.data || []).reduce((sum, row) => sum + Number(row.delta || 0), 0), recent: (ledger.data || []).slice(0, 10) },
    actions: actions.data || [],
    notes: notes.data || [],
    activity: activity.data || [],
    documents: (documents.data || []).map((d) => ({ ...d, listing: titles[d.listing_id] || null })),
  };
}

/** Accounts, listings, tickets and payments matching the text (an id, ticket number, email, name, title or payment reference). */
async function search(admin, query) {
  const q = String(query || '').trim().slice(0, 100);
  if (q.length < 2) return { users: [], listings: [], tickets: [], payments: [] };
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const isId = UUID.test(q);
  const ref = q.replace(/^\[?#/, '').replace(/\]$/, '');
  const ticketRef = /^[0-9a-f]{8}$/i.test(ref) ? ref.toLowerCase() : null;
  const [users, listings, tickets, payments] = await all([
    isId ? admin.from('profiles').select('id,full_name,username').eq('id', q).limit(1) : admin.rpc('admin_search_accounts', { p_query: q }),
    (isId ? admin.from('listings').select('id,title,host_id,moderation_status').eq('id', q) : admin.from('listings').select('id,title,host_id,moderation_status').ilike('title', like)).limit(10),
    (isId ? admin.from('support_tickets').select('id,subject,email,status').eq('id', q)
      : ticketRef ? admin.from('support_tickets').select('id,subject,email,status').gte('id', `${ticketRef}-0000-0000-0000-000000000000`).lte('id', `${ticketRef}-ffff-ffff-ffff-ffffffffffff`)
        : admin.from('support_tickets').select('id,subject,email,status').or(`subject.ilike.${JSON.stringify(like)},email.ilike.${JSON.stringify(like)}`)).limit(10),
    admin.from('billing_payments').select('id,host_id,provider_reference,amount_minor,currency,status,created_at').ilike('provider_reference', like).limit(10),
  ]);
  return { users: users.data || [], listings: listings.data || [], tickets: tickets.data || [], payments: payments.data || [] };
}

/**
 * The conversation a chat report is about, decrypted, for the admin
 * investigating it. Only reported conversations can be read, and the
 * caller records each reading.
 */
async function reportedConversation(admin, reportId) {
  const { data: report, error } = await admin.from('chat_user_reports')
    .select('id,conversation_id,reporter_user_id,reported_user_id,reason,details,status,created_at').eq('id', reportId).maybeSingle();
  if (error) throw error;
  if (!report) return null;
  const [conversation, messages] = await all([
    admin.from('conversations').select('id,host_id,client_id,listing_id').eq('id', report.conversation_id).maybeSingle(),
    admin.from('messages').select('id,sender_id,created_at,message_type,ciphertext,iv,key_version,deleted_at,attachment_id,listing_id')
      .eq('conversation_id', report.conversation_id).order('created_at', { ascending: false }).limit(300),
  ]);
  const rows = (messages.data || []).reverse();
  const attachmentIds = rows.map((m) => m.attachment_id).filter(Boolean);
  const [attachments, { names }] = await Promise.all([
    attachmentIds.length ? admin.from('message_attachments').select('id,kind,original_filename').in('id', attachmentIds) : { data: [] },
    people(admin, [report.reporter_user_id, report.reported_user_id]),
  ]);
  const attachmentById = Object.fromEntries((attachments.data || []).map((a) => [a.id, a]));
  return {
    report: { ...report, reporter: names[report.reporter_user_id] || null, reported: names[report.reported_user_id] || null },
    conversation: conversation.data || null,
    messages: rows.map((m) => {
      let body = null;
      if (m.deleted_at) body = 'This message was deleted';
      else if (m.ciphertext) {
        try { body = decryptMessage(m.ciphertext, m.iv, m.key_version); } catch { body = '[This message could not be decrypted]'; }
      }
      const attachment = attachmentById[m.attachment_id];
      return {
        id: m.id, sender_id: m.sender_id, created_at: m.created_at, message_type: m.message_type, body,
        attachment: attachment ? { kind: attachment.kind, filename: attachment.original_filename } : null,
      };
    }),
  };
}

module.exports = { accountOverview, search, reportedConversation };
