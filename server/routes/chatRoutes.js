'use strict';

const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { ValidationError, assertAllowedKeys, text, uuid, enumValue } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');
const { encryptMessage, decryptMessage } = require('../lib/messageEncryptionService');
const autoReply = require('../lib/autoReply');
const { markDelivered, readReceiptsShared, withVisibleReceipts } = require('../lib/chatReceipts');
const { removeChatAttachment } = require('../lib/chatAttachmentCleanup');
const mediaStorageService = require('../lib/mediaStorageService');
const { notifyNewMessage } = require('../lib/chatNotifications');
const { previewsFor } = require('../lib/chatPreviews');
const { clearedAtByConversation, visibleAfterClear, clearChat, conversationsBetween } = require('../lib/chatClears');

const router = express.Router();

async function authenticatedUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return error || !user ? null : user;
}

async function memberConversation(conversationId, userId) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id,listing_id,host_id,client_id,created_at')
    .eq('id', conversationId)
    .maybeSingle();
  if (error || !data || (data.host_id !== userId && data.client_id !== userId)) return null;
  return data;
}

async function profilesById(ids) {
  if (!ids.length) return {};
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id,full_name,username,avatar_url,phone')
    .in('id', ids);
  if (error) throw error;
  // Return contact fields used elsewhere in the product — never expose auth emails to other conversation participants.
  return Object.fromEntries((data || []).map((profile) => [profile.id, profile]));
}

// A listing in a chat (shared, or the one a message asks about): what its
// card shows, with the price as the Marketplace shows it.
const CHAT_LISTING_COLUMNS = 'id,host_id,title,location_text,category,listing_photos(storage_path),listing_booking_details(price_amount,price_unit,listing_purpose,sale_price_amount,sale_price_mode)';

/** The most photos sent together as one album. */
const ALBUM_MAX = 4;

// The conversations this person archived (for them only).
async function archivedConversationIds(userId) {
  const { data, error } = await supabaseAdmin.from('conversation_archives').select('conversation_id').eq('user_id', userId);
  if (error) throw error;
  return new Set((data || []).map((row) => row.conversation_id));
}

// The fields a reply quote needs from an attachment.
function quotedAttachment(attachment) {
  return attachment ? { id: attachment.id, kind: attachment.kind, original_filename: attachment.original_filename } : null;
}

function withDecryptedBody(message) {
  const { ciphertext, iv, key_version: keyVersion, ...publicMessage } = message;
  return {
    ...publicMessage,
    body: message.deleted_at ? 'This message was deleted' : decryptMessage(ciphertext, iv, keyVersion),
  };
}

router.get('/chat/listings', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const { data, error } = await supabaseAdmin
      .from('listings')
      .select('id,title,location_text,listing_photos(storage_path)')
      .eq('host_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ listings: data || [] });
  } catch (error) {
    console.error('Chat listing selection failed:', error);
    return res.status(502).json({ error: 'Unable to load listings' });
  }
});

router.post('/chat/reports', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    assertAllowedKeys(req.body, ['conversationId', 'reason', 'details']);
    const conversationId = uuid(req.body.conversationId, 'conversationId');
    const reason = text(req.body.reason, 'reason', { max: 200 });
    const details = text(req.body.details, 'details', { required: false, max: 2000 }) || null;
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    const reportedUserId = conversation.host_id === user.id ? conversation.client_id : conversation.host_id;
    const { data, error } = await supabaseAdmin.from('chat_user_reports').insert({
      reporter_user_id: user.id,
      reported_user_id: reportedUserId,
      conversation_id: conversationId,
      reason,
      details,
    }).select('id,reason,details,status,created_at').single();
    if (error) throw error;
    return res.status(201).json({ report: data });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat user report failed:', error);
    return res.status(502).json({ error: 'Unable to submit report' });
  }
});

router.get('/chat/unread-count', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const { data: conversations, error: conversationError } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .or(`host_id.eq.${user.id},client_id.eq.${user.id}`);
    if (conversationError) throw conversationError;
    // Archived conversations stay out of the count, as on the inbox.
    const archivedIds = await archivedConversationIds(user.id);
    const conversationIds = (conversations || []).map((conversation) => conversation.id).filter((id) => !archivedIds.has(id));
    if (!conversationIds.length) return res.json({ count: 0 });

    const unreadConversationIds = new Set();
    const clears = await clearedAtByConversation(supabaseAdmin, user.id);
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .select('conversation_id,created_at')
        .in('conversation_id', conversationIds)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      // Messages from before "Delete chat" no longer count.
      (data || []).filter((message) => visibleAfterClear(clears, message)).forEach((message) => unreadConversationIds.add(message.conversation_id));
      if (!data || data.length < pageSize) break;
    }
    return res.json({ count: unreadConversationIds.size });
  } catch (error) {
    console.error('Unread chat count failed:', error);
    return res.status(502).json({ error: 'Unable to load unread conversations' });
  }
});

router.get('/chat/conversations', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('id,listing_id,host_id,client_id,created_at')
      .or(`host_id.eq.${user.id},client_id.eq.${user.id}`)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const conversations = data || [];
    const participantIds = [...new Set(conversations.flatMap((conversation) => [
      conversation.host_id, conversation.client_id,
    ]).filter((id) => id && id !== user.id))];
    const [profiles, archivedIds, clears] = await Promise.all([
      profilesById(participantIds),
      archivedConversationIds(user.id),
      clearedAtByConversation(supabaseAdmin, user.id),
    ]);
    const conversationIds = conversations.map(({ id }) => id);
    let previews = [];
    if (conversationIds.length) {
      const result = await supabaseAdmin
        .from('messages')
        .select('id,conversation_id,sender_id,ciphertext,iv,key_version,created_at,deleted_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false });
      if (result.error) throw result.error;
      const deletionResult = await supabaseAdmin
        .from('message_user_deletions')
        .select('message_id')
        .eq('user_id', user.id)
        .in('conversation_id', conversationIds);
      if (deletionResult.error) throw deletionResult.error;
      const hiddenMessageIds = new Set((deletionResult.data || []).map((deletion) => deletion.message_id));
      // The newest message each person can see per conversation (decrypted only for those).
      const seen = new Set();
      previews = (result.data || [])
        .filter((message) => !hiddenMessageIds.has(message.id) && visibleAfterClear(clears, message))
        .filter((message) => {
          if (seen.has(message.conversation_id)) return false;
          seen.add(message.conversation_id);
          return true;
        })
        .map(withDecryptedBody);
    }
    // The inbox reached this person: everything sent to them is delivered.
    markDelivered(supabaseAdmin, user.id, conversationIds)
      .catch((error) => console.error('Chat delivery receipt update failed:', error));
    const previewByConversation = Object.fromEntries(previews.map((message) => [message.conversation_id, message]));
    const latestByParticipant = new Map();
    // A deleted chat stays out of the inbox until a new message arrives.
    const listed = conversations.filter((conversation) => !clears.has(conversation.id) || previewByConversation[conversation.id]);
    listed.sort((left, right) => {
      const leftTime = previewByConversation[left.id] && previewByConversation[left.id].created_at || left.created_at;
      const rightTime = previewByConversation[right.id] && previewByConversation[right.id].created_at || right.created_at;
      return new Date(rightTime).getTime() - new Date(leftTime).getTime();
    });
    const uniqueConversations = listed.filter((conversation) => {
      const participantId = conversation.host_id === user.id ? conversation.client_id : conversation.host_id;
      if (latestByParticipant.has(participantId)) return false;
      latestByParticipant.set(participantId, conversation.id);
      return true;
    });
    return res.json({
      conversations: uniqueConversations.map((conversation) => ({
        ...conversation,
        participant: profiles[conversation.host_id === user.id ? conversation.client_id : conversation.host_id] || null,
        lastMessage: previewByConversation[conversation.id] || null,
        archived: archivedIds.has(conversation.id),
      })),
    });
  } catch (error) {
    console.error('Chat conversation list failed:', error);
    return res.status(502).json({ error: 'Unable to load conversations' });
  }
});

router.get('/chat/conversations/:conversationId/messages', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    const since = typeof req.query.since === 'string' && req.query.since.trim() ? req.query.since.trim() : null;
    const before = typeof req.query.before === 'string' && req.query.before.trim() ? req.query.before.trim() : null;
    const limitParam = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null;

    let query = supabaseAdmin
      .from('messages')
      .select('id,conversation_id,sender_id,ciphertext,iv,key_version,created_at,delivered_at,read_at,message_type,attachment_id,listing_id,reply_to_message_id,album_id,deleted_at,pinned_at')
      .eq('conversation_id', conversationId);

    if (since) {
      query = query.gt('created_at', since);
    }
    if (before) {
      query = query.lt('created_at', before);
    }
    if (limit && !since) {
      query = query.order('created_at', { ascending: false }).limit(limit);
    } else {
      query = query.order('created_at', { ascending: true });
    }

    // Messages fetched here have reached this person (opening a chat, or a
    // live message arriving in the open chat).
    const [{ data, error }, receiptsShared] = await Promise.all([
      query,
      readReceiptsShared(supabaseAdmin, conversation).catch((receiptError) => {
        console.error('Chat read receipts lookup failed:', receiptError);
        return true;
      }),
      markDelivered(supabaseAdmin, user.id, [conversationId])
        .catch((deliveryError) => console.error('Chat delivery receipt update failed:', deliveryError)),
    ]);
    if (error) throw error;
    const rawRows = limit && !since ? (data || []).reverse() : (data || []);
    const deletionResult = await supabaseAdmin
      .from('message_user_deletions')
      .select('message_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
    if (deletionResult.error) throw deletionResult.error;
    const hiddenMessageIds = new Set((deletionResult.data || []).map((deletion) => deletion.message_id));
    // Messages from before this person's "Delete chat" are gone for them.
    const clears = await clearedAtByConversation(supabaseAdmin, user.id);
    const visibleRows = rawRows.filter((message) => !hiddenMessageIds.has(message.id) && visibleAfterClear(clears, message));
    const visibleById = new Map(visibleRows.map((message) => [message.id, message]));

    const missingReplyIds = visibleRows
      .filter((message) => message.reply_to_message_id && !visibleById.has(message.reply_to_message_id))
      .map((message) => message.reply_to_message_id);
    if (missingReplyIds.length) {
      const replyResult = await supabaseAdmin
        .from('messages')
        .select('id,conversation_id,sender_id,ciphertext,iv,key_version,created_at,delivered_at,read_at,message_type,attachment_id,listing_id,reply_to_message_id,album_id,deleted_at,pinned_at')
        .in('id', missingReplyIds);
      if (!replyResult.error && replyResult.data) {
        replyResult.data.forEach((replyMsg) => {
          if (!hiddenMessageIds.has(replyMsg.id) && visibleAfterClear(clears, replyMsg)) {
            visibleById.set(replyMsg.id, replyMsg);
          }
        });
      }
    }
    // Replied-to messages included: their quotes show a photo, file or listing.
    const quotedRows = [...visibleById.values()].filter((message) => !message.deleted_at);
    const attachmentIds = [...new Set(quotedRows.map((message) => message.attachment_id).filter(Boolean))];
    let attachments = [];
    if (attachmentIds.length) {
      const attachmentResult = await supabaseAdmin
        .from('message_attachments')
        .select('id,original_filename,mime_type,file_size_bytes,kind,status')
        .in('id', attachmentIds);
      if (attachmentResult.error) throw attachmentResult.error;
      attachments = attachmentResult.data || [];
    }
    const attachmentsById = Object.fromEntries(attachments.map((attachment) => [attachment.id, attachment]));
    const listingIds = [...new Set(quotedRows.map((message) => message.listing_id).filter(Boolean))];
    let listingsById = {};
    if (listingIds.length) {
      const listingResult = await supabaseAdmin
        .from('listings')
        .select(CHAT_LISTING_COLUMNS)
        .in('id', listingIds);
      if (listingResult.error) throw listingResult.error;
      listingsById = Object.fromEntries((listingResult.data || []).map((listing) => [listing.id, listing]));
    }
    return res.json({
      conversation,
      messages: visibleRows.map((row) => {
        const message = withVisibleReceipts(withDecryptedBody(row), user.id, receiptsShared);
        const reply = message.reply_to_message_id && visibleById.get(message.reply_to_message_id);
        return {
          attachment: message.deleted_at ? null : attachmentsById[message.attachment_id] || null,
          listing: message.deleted_at ? null : listingsById[message.listing_id] || null,
          reply_to_message: reply ? {
            id: reply.id,
            sender_id: reply.sender_id,
            body: reply.deleted_at ? null : withDecryptedBody(reply).body,
            deleted_at: reply.deleted_at,
            message_type: reply.message_type,
            attachment: reply.deleted_at ? null : quotedAttachment(attachmentsById[reply.attachment_id]),
            listing: reply.deleted_at || !listingsById[reply.listing_id] ? null : { id: reply.listing_id, title: listingsById[reply.listing_id].title },
          } : null,
          ...message,
        };
      }),
    });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat message list failed:', error);
    return res.status(502).json({ error: 'Unable to load messages' });
  }
});

router.post('/chat/conversations/:conversationId/messages/:messageId/actions', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const messageId = uuid(req.params.messageId, 'message id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    assertAllowedKeys(req.body, ['action']);
    const action = enumValue(req.body.action, 'action', ['pin', 'delete_for_me', 'delete_for_everyone']);
    const { data: message, error: messageError } = await supabaseAdmin
      .from('messages')
      .select('id,conversation_id,sender_id,message_type,attachment_id,deleted_at')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (messageError) throw messageError;
    // Every kind of message: text, photos, files, voice notes and listings.
    if (!message || message.deleted_at) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (action === 'delete_for_me') {
      const { error } = await supabaseAdmin.from('message_user_deletions').upsert({
        conversation_id: conversationId,
        message_id: messageId,
        user_id: user.id,
      }, { onConflict: 'message_id,user_id' });
      if (error) throw error;
    } else if (action === 'delete_for_everyone') {
      if (message.sender_id !== user.id) {
        return res.status(403).json({ error: 'Only the sender can delete this message for everyone' });
      }
      const { data: deletedMessage, error } = await supabaseAdmin
        .from('messages')
        .update({
          ciphertext: null,
          iv: null,
          key_version: null,
          attachment_id: null,
          listing_id: null,
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          pinned_at: null,
          pinned_by: null,
        })
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .eq('sender_id', user.id)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!deletedMessage) return res.status(403).json({ error: 'Only the sender can delete this message for everyone' });
      // The photo, file or voice note goes too; the message is already deleted if this fails.
      await removeChatAttachment(supabaseAdmin, mediaStorageService, message.attachment_id)
        .catch((cleanupError) => console.error('Deleted message attachment cleanup failed:', cleanupError));
    } else {
      const { error } = await supabaseAdmin.rpc('toggle_chat_message_pin', {
        p_conversation_id: conversationId,
        p_message_id: messageId,
        p_user_id: user.id,
      });
      if (error) throw error;
    }
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat message action failed:', error);
    return res.status(502).json({ error: 'Unable to update message' });
  }
});

// "Chat" on a listing: the signed-in person's conversation with its host.
// One conversation per pair of people: an existing one is reused (the one
// with the latest message), otherwise one is created for this listing. The
// listing travels with the first message (listingId), so each question shows
// which listing it is about.
router.post('/chat/conversations/start', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    assertAllowedKeys(req.body, ['listingId']);
    const listingId = uuid(req.body.listingId, 'listingId');
    const { data: listing, error: listingError } = await supabaseAdmin
      .from('listings').select('id,host_id').eq('id', listingId).maybeSingle();
    if (listingError) throw listingError;
    if (!listing || !listing.host_id) return res.status(404).json({ error: 'Listing not found' });
    if (listing.host_id === user.id) return res.status(400).json({ error: 'This is your own listing' });

    const existing = await conversationsBetween(supabaseAdmin, user.id, listing.host_id);
    if (existing.length) {
      const { data: latest, error: latestError } = await supabaseAdmin
        .from('messages').select('conversation_id')
        .in('conversation_id', existing)
        .order('created_at', { ascending: false })
        .limit(1);
      if (latestError) throw latestError;
      let conversationId = latest && latest[0] ? latest[0].conversation_id : null;
      if (!conversationId) {
        const { data: newest, error: newestError } = await supabaseAdmin
          .from('conversations').select('id').in('id', existing)
          .order('created_at', { ascending: false }).limit(1);
        if (newestError) throw newestError;
        conversationId = newest && newest[0] ? newest[0].id : existing[0];
      }
      return res.json({ conversationId, created: false });
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from('conversations')
      .upsert({ listing_id: listingId, host_id: listing.host_id, client_id: user.id }, { onConflict: 'listing_id,client_id' })
      .select('id')
      .single();
    if (createError) throw createError;
    return res.status(201).json({ conversationId: created.id, created: true });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat start failed:', error);
    return res.status(502).json({ error: 'Unable to open the chat' });
  }
});

// Archive or unarchive a conversation for this person. New messages leave it archived.
router.post('/chat/conversations/:conversationId/archive', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    assertAllowedKeys(req.body, ['archived']);
    if (typeof req.body.archived !== 'boolean') throw new ValidationError('archived must be true or false');
    const { error } = req.body.archived
      ? await supabaseAdmin.from('conversation_archives').upsert({ user_id: user.id, conversation_id: conversationId }, { onConflict: 'user_id,conversation_id' })
      : await supabaseAdmin.from('conversation_archives').delete().eq('user_id', user.id).eq('conversation_id', conversationId);
    if (error) throw error;
    return res.json({ archived: req.body.archived });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat archive update failed:', error);
    return res.status(502).json({ error: 'Unable to update the archive' });
  }
});

// "Delete chat": clears this person's copy of every conversation with the
// other person; the chat returns to their inbox only with new messages.
router.post('/chat/conversations/:conversationId/delete', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    const conversationIds = await clearChat(supabaseAdmin, user.id, conversation);
    return res.json({ deleted: true, conversationIds });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat delete failed:', error);
    return res.status(502).json({ error: 'Unable to delete the chat' });
  }
});

// Previews for "New message" notifications, decrypted for their recipient
// only when Message previews is on. ?ids=<message id>,… (at most 50).
router.get('/chat/message-previews', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const raw = typeof req.query.ids === 'string' ? req.query.ids.split(',').map((id) => id.trim()).filter(Boolean) : [];
    if (raw.length > 50) throw new ValidationError('At most 50 messages per request');
    const ids = [...new Set(raw.map((id) => uuid(id, 'message id')))];
    return res.json(await previewsFor(supabaseAdmin, user.id, ids));
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat message previews failed:', error);
    return res.status(502).json({ error: 'Unable to load message previews' });
  }
});

router.post('/chat/conversations/:conversationId/read', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    // A message is delivered before it is read.
    await markDelivered(supabaseAdmin, user.id, [conversationId]);
    const { error } = await supabaseAdmin
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id)
      .is('read_at', null);
    if (error) throw error;
    return res.status(204).send();
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat read receipt update failed:', error);
    return res.status(502).json({ error: 'Unable to update read receipts' });
  }
});

router.post('/chat/conversations/:conversationId/reply', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    assertAllowedKeys(req.body, ['command']);
    const command = text(req.body.command, 'command', { max: 20 });
    if (command.toLowerCase() !== '@reply') {
      throw new ValidationError('Only the @reply command is supported');
    }
    if (conversation.host_id !== user.id) {
      return res.status(403).json({ error: 'Only the host can use the @reply command.' });
    }
    return res.json(await autoReply.replyOnCommand(conversation));
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chatbot @reply request failed:', { stage: error.stage || null, error: error.message });
    return res.status(503).json({ error: 'Elie couldn’t write a reply right now. Please try again.' });
  }
});

router.post('/chat/conversations/:conversationId/messages', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    assertAllowedKeys(req.body, ['content', 'attachmentId', 'messageType', 'listingId', 'replyToMessageId', 'albumId']);
    const content = text(req.body.content, 'content', { required: false, max: 10_000 }) || '';
    const messageType = req.body.messageType === undefined
      ? 'text'
      : enumValue(req.body.messageType, 'messageType', ['text', 'photo', 'file', 'voice', 'listing']);
    const attachmentId = req.body.attachmentId === undefined
      ? undefined
      : uuid(req.body.attachmentId, 'attachmentId');
    const listingId = req.body.listingId === undefined ? undefined : uuid(req.body.listingId, 'listingId');
    const replyToMessageId = req.body.replyToMessageId === undefined
      ? undefined
      : uuid(req.body.replyToMessageId, 'replyToMessageId');
    if (replyToMessageId && messageType !== 'text') {
      throw new ValidationError('Replies must be text messages');
    }
    // Photos sent together (up to 4) share an album id; the chat shows them as one collage.
    const albumId = req.body.albumId === undefined ? undefined : uuid(req.body.albumId, 'albumId');
    if (albumId && messageType !== 'photo') {
      throw new ValidationError('Only photos can be sent as an album');
    }
    let albumSoFar = 0;
    if (albumId) {
      const { data: albumRows, error: albumError } = await supabaseAdmin
        .from('messages')
        .select('id,sender_id')
        .eq('conversation_id', conversationId)
        .eq('album_id', albumId);
      if (albumError) throw albumError;
      if ((albumRows || []).some((row) => row.sender_id !== user.id)) {
        throw new ValidationError('That album belongs to someone else');
      }
      albumSoFar = (albumRows || []).length;
      if (albumSoFar >= ALBUM_MAX) throw new ValidationError(`An album holds at most ${ALBUM_MAX} photos`);
    }
    if (replyToMessageId) {
      const { data: repliedMessage, error: repliedMessageError } = await supabaseAdmin
        .from('messages')
        .select('id,message_type,deleted_at')
        .eq('id', replyToMessageId)
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (repliedMessageError) throw repliedMessageError;
      if (!repliedMessage || repliedMessage.deleted_at) {
        return res.status(400).json({ error: 'The message being replied to is unavailable' });
      }
      const { data: hiddenMessage, error: hiddenMessageError } = await supabaseAdmin
        .from('message_user_deletions')
        .select('message_id')
        .eq('message_id', replyToMessageId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (hiddenMessageError) throw hiddenMessageError;
      if (hiddenMessage) return res.status(400).json({ error: 'The message being replied to is unavailable' });
    }
    if (messageType === 'listing' && !listingId) {
      throw new ValidationError('listingId is required for listing messages');
    }
    // On a text message, listingId is the listing it asks about ("Chat" on a listing).
    if (messageType !== 'listing' && messageType !== 'text' && listingId) {
      throw new ValidationError('listingId is only valid for listing and text messages');
    }
    // Attachment and listing rows are loaded here, before the insert, so
    // nothing after the message is saved can fail the request.
    let listing = null;
    if (listingId) {
      let listingQuery = supabaseAdmin.from('listings').select(CHAT_LISTING_COLUMNS).eq('id', listingId);
      // Shared listings are the sender's own; a question may be about either person's listing.
      listingQuery = messageType === 'listing'
        ? listingQuery.eq('host_id', user.id)
        : listingQuery.in('host_id', [conversation.host_id, conversation.client_id]);
      const { data: foundListing, error: listingError } = await listingQuery.maybeSingle();
      if (listingError) throw listingError;
      if (!foundListing) {
        return res.status(403).json({ error: messageType === 'listing' ? 'Listing sharing is limited to your listings' : 'That listing is not part of this conversation' });
      }
      listing = foundListing;
    }
    if (messageType !== 'text' && messageType !== 'listing' && !attachmentId) {
      throw new ValidationError('attachmentId is required for attachment messages');
    }
    if (messageType === 'text' && attachmentId) {
      throw new ValidationError('attachmentId is not valid for text messages');
    }
    let attachment = null;
    if (attachmentId) {
      const { data: readyAttachment, error: attachmentError } = await supabaseAdmin
        .from('message_attachments')
        .select('id,original_filename,mime_type,file_size_bytes,kind,status')
        .eq('id', attachmentId)
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (attachmentError || !readyAttachment || readyAttachment.status !== 'ready') {
        return res.status(400).json({ error: 'Attachment is not ready' });
      }
      if ((messageType === 'photo' && readyAttachment.kind !== 'photo')
        || (messageType === 'file' && readyAttachment.kind !== 'file')
        || (messageType === 'voice' && readyAttachment.kind !== 'voice')) {
        return res.status(400).json({ error: 'Attachment type does not match message type' });
      }
      attachment = readyAttachment;
    }
    const encryptedMessage = encryptMessage(content);
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        ...encryptedMessage,
        message_type: messageType,
        attachment_id: attachmentId || null,
        listing_id: listingId || null,
        reply_to_message_id: replyToMessageId || null,
        album_id: albumId || null,
      })
        .select('id,conversation_id,sender_id,ciphertext,iv,key_version,created_at,message_type,attachment_id,listing_id,reply_to_message_id,album_id')
        .single();
      if (error) throw error;
      console.info('Chat message persisted:', {
        conversationId,
        messageId: data.id,
        senderId: user.id,
      });

    const recipientUserId = conversation.host_id === user.id ? conversation.client_id : conversation.host_id;
    console.info('Notification recipient resolved:', {
      conversationId,
      recipientResolved: Boolean(recipientUserId),
      recipientIsSender: recipientUserId === user.id,
    });
    const listingTitle = listing ? listing.title : null;
    let notificationPersisted = true;
    // An album notifies once, for its first photo (the client saves them in order).
    if (!albumSoFar) {
      try {
        const { data: senderProfile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        const notificationMessage = listingTitle ? `${senderProfile?.full_name || 'Someone'} sent you a message about ${listingTitle}.` : `${senderProfile?.full_name || 'Someone'} sent you a message.`;
        // Skipped when the recipient turned Message notifications off.
        await notifyNewMessage({
          recipientUserId,
          actorUserId: user.id,
          message: notificationMessage,
          relatedEntityType: 'conversation',
          relatedEntityId: conversationId,
          metadata: {
            conversation_id: conversationId,
            sender_id: user.id,
            message_id: data.id,
            listing_id: listingId || conversation.listing_id || null,
            listing_title: listingTitle,
          },
          eventKey: `message:${conversationId}:${data.id}`,
        });
      } catch (notificationError) {
        notificationPersisted = false;
        console.error('Notification persistence failed after chat message persisted:', {
          conversationId,
          messageId: data.id,
          code: notificationError.code,
          message: notificationError.message,
        });
      }
    }

    // Away mode: Elie may answer for the host in the background.
    if (conversation.client_id === user.id && messageType === 'text' && content) {
      autoReply.handleGuestMessage(conversation);
    }
    return res.status(201).json({
      message: { ...withDecryptedBody(data), attachment, listing },
      notification: { persisted: notificationPersisted },
    });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat message send failed:', error);
    return res.status(502).json({ error: 'Unable to send message' });
  }
});

module.exports = router;
