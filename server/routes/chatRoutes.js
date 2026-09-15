'use strict';

const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { createNotification } = require('../lib/notifications');
const { ValidationError, assertAllowedKeys, text, uuid, enumValue } = require('../lib/inputValidation');

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
    .select('id,full_name,username,avatar_url')
    .in('id', ids);
  if (error) throw error;
  const profiles = Object.fromEntries((data || []).map((profile) => [profile.id, profile]));
  const emailResults = await Promise.all(ids.map(async (id) => {
    try {
      const { data: result, error: authError } = await supabaseAdmin.auth.admin.getUserById(id);
      if (authError) {
        console.warn('Chat profile email lookup failed:', id, authError.message);
        return null;
      }
      return result && result.user && result.user.email
        ? { id, email: result.user.email }
        : null;
    } catch (error) {
      console.warn('Chat profile email lookup failed:', id, error.message);
      return null;
    }
  }));
  emailResults.filter(Boolean).forEach(({ id, email }) => {
    profiles[id] = { ...(profiles[id] || { id }), email };
  });
  return profiles;
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
        .select('id,conversation_id,sender_id,body,created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false });
      if (result.error) throw result.error;
      const seen = new Set();
      previews = (result.data || []).filter((message) => {
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
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('id,conversation_id,sender_id,body,created_at,read_at,message_type,attachment_id,listing_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const attachmentIds = (data || []).map((message) => message.attachment_id).filter(Boolean);
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
    const listingIds = (data || []).map((message) => message.listing_id).filter(Boolean);
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
      messages: (data || []).map((message) => ({
        ...message,
        attachment: attachmentsById[message.attachment_id] || null,
        listing: listingsById[message.listing_id] || null,
      })),
    });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat message list failed:', error);
    return res.status(502).json({ error: 'Unable to load messages' });
  }
});

router.post('/chat/conversations/:conversationId/read', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
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

router.post('/chat/conversations/:conversationId/messages', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    assertAllowedKeys(req.body, ['content', 'attachmentId', 'messageType', 'listingId']);
    const content = text(req.body.content, 'content', { required: false, max: 10_000 }) || '';
    const messageType = req.body.messageType === undefined
      ? 'text'
      : enumValue(req.body.messageType, 'messageType', ['text', 'photo', 'file', 'voice', 'listing']);
    const attachmentId = req.body.attachmentId === undefined
      ? undefined
      : uuid(req.body.attachmentId, 'attachmentId');
    const listingId = req.body.listingId === undefined ? undefined : uuid(req.body.listingId, 'listingId');
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
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body: content,
        message_type: messageType,
        attachment_id: attachmentId || null,
        listing_id: listingId || null,
      })
      .select('id,conversation_id,sender_id,body,created_at,message_type,attachment_id,listing_id')
      .single();
    if (error) throw error;

    const recipientUserId = conversation.host_id === user.id ? conversation.client_id : conversation.host_id;
    const { data: senderProfile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const listingTitle = listingId ? (await supabaseAdmin.from('listings').select('title').eq('id', listingId).maybeSingle()).data?.title : null;
    const notificationMessage = listingTitle ? `${senderProfile?.full_name || 'Someone'} sent you a message about ${listingTitle}.` : `${senderProfile?.full_name || 'Someone'} sent you a message.`;
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
    return res.status(201).json({ message: { ...data, attachment, listing } });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat message send failed:', error);
    return res.status(502).json({ error: 'Unable to send message' });
  }
});

module.exports = router;
