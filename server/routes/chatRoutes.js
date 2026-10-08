'use strict';

const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { createNotification } = require('../lib/notifications');
const { ValidationError, assertAllowedKeys, text, uuid, enumValue } = require('../lib/inputValidation');
const { rejectSuspendedActivity } = require('../lib/accountAccess');
const { encryptMessage, decryptMessage } = require('../lib/messageEncryptionService');

const router = express.Router();
const chatbotApiUrl = (process.env.CHATBOT_API_URL || 'https://elie1-0.onrender.com').replace(/\/$/, '');

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

async function requestChatbotReply(conversationId, token, payload) {
  console.info('Elie invoked:', {
    conversationId,
    trigger: payload.command || 'away_mode',
  });
  const response = await fetch(`${chatbotApiUrl}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ conversation_id: conversationId, ...payload }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Elie response generation failed:', {
      conversationId,
      trigger: payload.command || 'away_mode',
      status: response.status,
      detail: body.detail || body.error || null,
      responseKeys: Object.keys(body),
    });
    const error = new Error(body.detail || body.error || `Chatbot reply failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  console.info('Elie response generated:', {
    conversationId,
    trigger: payload.command || 'away_mode',
    responseKeys: Object.keys(body),
    hasResponse: Boolean(body.reply || body.response || body.message || body.content),
  });
  console.info('Elie response persistence attempted:', {
    conversationId,
    trigger: payload.command || 'away_mode',
    hasPersistedMessage: Boolean(body.message || (Array.isArray(body.messages) && body.messages.length)),
  });
  console.info('Elie response persisted:', {
    conversationId,
    trigger: payload.command || 'away_mode',
    persistedMessage: Boolean(body.message || (Array.isArray(body.messages) && body.messages.length)),
  });
  return body;
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
    const conversationIds = (conversations || []).map((conversation) => conversation.id);
    if (!conversationIds.length) return res.json({ count: 0 });

    const unreadConversationIds = new Set();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds)
        .neq('sender_id', user.id)
        .is('read_at', null)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      (data || []).forEach((message) => unreadConversationIds.add(message.conversation_id));
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
    const profiles = await profilesById(participantIds);
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
      const seen = new Set();
      previews = (result.data || []).filter((message) => !hiddenMessageIds.has(message.id))
        .map(withDecryptedBody).filter((message) => {
          if (seen.has(message.conversation_id)) return false;
          seen.add(message.conversation_id);
          return true;
        });
    }
    const previewByConversation = Object.fromEntries(previews.map((message) => [message.conversation_id, message]));
    const latestByParticipant = new Map();
    conversations.sort((left, right) => {
      const leftTime = previewByConversation[left.id] && previewByConversation[left.id].created_at || left.created_at;
      const rightTime = previewByConversation[right.id] && previewByConversation[right.id].created_at || right.created_at;
      return new Date(rightTime).getTime() - new Date(leftTime).getTime();
    });
    const uniqueConversations = conversations.filter((conversation) => {
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
    let query = supabaseAdmin
      .from('messages')
      .select('id,conversation_id,sender_id,ciphertext,iv,key_version,created_at,read_at,message_type,attachment_id,listing_id,reply_to_message_id,deleted_at,pinned_at')
      .eq('conversation_id', conversationId);

    const since = typeof req.query.since === 'string' && req.query.since.trim() ? req.query.since.trim() : null;
    const before = typeof req.query.before === 'string' && req.query.before.trim() ? req.query.before.trim() : null;
    const limitParam = req.query.limit ? parseInt(req.query.limit, 10) : null;
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : null;

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

    const { data, error } = await query;
    if (error) throw error;
    const rawRows = limit && !since ? (data || []).reverse() : (data || []);
    const deletionResult = await supabaseAdmin
      .from('message_user_deletions')
      .select('message_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
    if (deletionResult.error) throw deletionResult.error;
    const hiddenMessageIds = new Set((deletionResult.data || []).map((deletion) => deletion.message_id));
    const visibleRows = rawRows.filter((message) => !hiddenMessageIds.has(message.id));
    const visibleById = new Map(visibleRows.map((message) => [message.id, message]));

    const missingReplyIds = visibleRows
      .filter((message) => message.reply_to_message_id && !visibleById.has(message.reply_to_message_id))
      .map((message) => message.reply_to_message_id);
    if (missingReplyIds.length) {
      const replyResult = await supabaseAdmin
        .from('messages')
        .select('id,conversation_id,sender_id,ciphertext,iv,key_version,created_at,read_at,message_type,attachment_id,listing_id,reply_to_message_id,deleted_at,pinned_at')
        .in('id', missingReplyIds);
      if (!replyResult.error && replyResult.data) {
        replyResult.data.forEach((replyMsg) => {
          if (!hiddenMessageIds.has(replyMsg.id)) {
            visibleById.set(replyMsg.id, replyMsg);
          }
        });
      }
    }
    const attachmentIds = visibleRows
      .filter((message) => !message.deleted_at)
      .map((message) => message.attachment_id)
      .filter(Boolean);
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
    const listingIds = visibleRows
      .filter((message) => !message.deleted_at)
      .map((message) => message.listing_id)
      .filter(Boolean);
    let listingsById = {};
    if (listingIds.length) {
      const listingResult = await supabaseAdmin
        .from('listings')
        .select('id,title,location_text,category,listing_photos(storage_path)')
        .in('id', listingIds);
      if (listingResult.error) throw listingResult.error;
      listingsById = Object.fromEntries((listingResult.data || []).map((listing) => [listing.id, listing]));
    }
    return res.json({
      conversation,
      messages: visibleRows.map((row) => {
        const message = withDecryptedBody(row);
        const reply = message.reply_to_message_id && visibleById.get(message.reply_to_message_id);
        return {
          attachment: message.deleted_at ? null : attachmentsById[message.attachment_id] || null,
          listing: message.deleted_at ? null : listingsById[message.listing_id] || null,
          reply_to_message: reply ? {
            id: reply.id,
            sender_id: reply.sender_id,
            body: reply.deleted_at ? null : withDecryptedBody(reply).body,
            deleted_at: reply.deleted_at,
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
      .select('id,conversation_id,sender_id,message_type,deleted_at')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message || message.message_type !== 'text' || message.deleted_at) {
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

router.post('/chat/conversations/:conversationId/read', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    if (await rejectSuspendedActivity(res, user.id)) return;
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
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
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    assertAllowedKeys(req.body, ['command']);
    const command = text(req.body.command, 'command', { max: 20 });
    if (command.toLowerCase() !== '@reply') {
      throw new ValidationError('Only the @reply command is supported');
    }
    const token = (req.headers.authorization || '').slice(7);
    const result = await requestChatbotReply(conversationId, token, { command });
    return res.json(result);
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chatbot @reply request failed:', error);
    return res.status(error.status && error.status >= 400 && error.status < 500 ? error.status : 502)
      .json({ error: error.message || 'Unable to generate a reply' });
  }
});

router.post('/chat/conversations/:conversationId/messages', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    assertAllowedKeys(req.body, ['content', 'attachmentId', 'messageType', 'listingId', 'replyToMessageId']);
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
    if (replyToMessageId) {
      const { data: repliedMessage, error: repliedMessageError } = await supabaseAdmin
        .from('messages')
        .select('id,message_type,deleted_at')
        .eq('id', replyToMessageId)
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (repliedMessageError) throw repliedMessageError;
      if (!repliedMessage || repliedMessage.message_type !== 'text' || repliedMessage.deleted_at) {
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
    if (messageType !== 'listing' && listingId) {
      throw new ValidationError('listingId is only valid for listing messages');
    }
    if (listingId) {
      const { data: listing, error: listingError } = await supabaseAdmin
        .from('listings')
        .select('id')
        .eq('id', listingId)
        .eq('host_id', user.id)
        .maybeSingle();
      if (listingError) throw listingError;
      if (!listing) return res.status(403).json({ error: 'Listing sharing is limited to your listings' });
    }
    if (messageType !== 'text' && messageType !== 'listing' && !attachmentId) {
      throw new ValidationError('attachmentId is required for attachment messages');
    }
    if (messageType === 'text' && attachmentId) {
      throw new ValidationError('attachmentId is not valid for text messages');
    }
    if (attachmentId) {
      const { data: attachment, error: attachmentError } = await supabaseAdmin
        .from('message_attachments')
        .select('id,status,kind')
        .eq('id', attachmentId)
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (attachmentError || !attachment || attachment.status !== 'ready') {
        return res.status(400).json({ error: 'Attachment is not ready' });
      }
      if ((messageType === 'photo' && attachment.kind !== 'photo')
        || (messageType === 'file' && attachment.kind !== 'file')
        || (messageType === 'voice' && attachment.kind !== 'voice')) {
        return res.status(400).json({ error: 'Attachment type does not match message type' });
      }
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
      })
        .select('id,conversation_id,sender_id,ciphertext,iv,key_version,created_at,message_type,attachment_id,listing_id,reply_to_message_id')
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
    const { data: senderProfile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const listingTitle = listingId ? (await supabaseAdmin.from('listings').select('title').eq('id', listingId).maybeSingle()).data?.title : null;
    const notificationMessage = listingTitle ? `${senderProfile?.full_name || 'Someone'} sent you a message about ${listingTitle}.` : `${senderProfile?.full_name || 'Someone'} sent you a message.`;
    let notificationPersisted = true;
    try {
      await createNotification({
        recipientUserId,
        actorUserId: user.id,
        type: 'new_message',
        title: 'New message',
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

    if (conversation.client_id === user.id && messageType === 'text' && content) {
      const { data: recipientProfile, error: recipientProfileError } = await supabaseAdmin
        .from('profiles')
        .select('away_mode')
        .eq('id', recipientUserId)
        .maybeSingle();
      if (recipientProfileError) throw recipientProfileError;
      const awayModeDetected = Boolean(recipientProfile && recipientProfile.away_mode);
      const token = (req.headers.authorization || '').slice(7);
      console.info('Away mode detected:', {
        conversationId,
        recipientUserId,
        messageId: data.id,
        detected: awayModeDetected,
      });
      if (awayModeDetected) {
        requestChatbotReply(conversationId, token, {
          message: content,
          listing_id: conversation.listing_id || listingId || null,
        }).catch((replyError) => {
          console.error('Away-mode chatbot response/send failed:', {
            conversationId,
            error: replyError.message,
            code: replyError.code,
            status: replyError.status,
          });
        });
      }
    }
    let attachment = null;
    if (attachmentId) {
      const attachmentResult = await supabaseAdmin
        .from('message_attachments')
        .select('id,original_filename,mime_type,file_size_bytes,kind,status')
        .eq('id', attachmentId)
        .single();
      if (attachmentResult.error) throw attachmentResult.error;
      attachment = attachmentResult.data;
    }
    let listing = null;
    if (listingId) {
      const listingResult = await supabaseAdmin
        .from('listings')
        .select('id,title,location_text,category,listing_photos(storage_path)')
        .eq('id', listingId)
        .single();
      if (listingResult.error) throw listingResult.error;
      listing = listingResult.data;
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
