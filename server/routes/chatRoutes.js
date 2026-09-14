'use strict';

const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
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
    .select('id,listing_id,host_id,client_id,created_at,updated_at')
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
  const profiles = Object.fromEntries((data || []).map((profile) => [profile.id, profile]));
  await Promise.all(ids.map(async (id) => {
    const { data: result } = await supabaseAdmin.auth.admin.getUserById(id);
    if (result && result.user && result.user.email) {
      profiles[id] = { ...(profiles[id] || { id }), email: result.user.email };
    }
  }));
  return profiles;
}

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
        .select('id,conversation_id,sender_id,body,created_at,message_type')
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
    conversations.sort((left, right) => {
      const leftTime = previewByConversation[left.id] && previewByConversation[left.id].created_at || left.created_at;
      const rightTime = previewByConversation[right.id] && previewByConversation[right.id].created_at || right.created_at;
      return new Date(rightTime).getTime() - new Date(leftTime).getTime();
    });
    return res.json({
      conversations: conversations.map((conversation) => ({
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
    return res.json({ conversation, messages: data || [] });
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
    assertAllowedKeys(req.body, ['content', 'attachmentId', 'messageType']);
    const content = text(req.body.content, 'content', { required: false, max: 10_000 }) || '';
    const messageType = req.body.messageType === undefined
      ? 'text'
      : enumValue(req.body.messageType, 'messageType', ['text', 'photo', 'file', 'voice']);
    const attachmentId = req.body.attachmentId === undefined
      ? undefined
      : uuid(req.body.attachmentId, 'attachmentId');
    if (messageType !== 'text' && !attachmentId) {
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
      })
      .select('id,conversation_id,sender_id,body,created_at,message_type,attachment_id,listing_id')
      .single();
    if (error) throw error;
    return res.status(201).json({ message: data });
  } catch (error) {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error('Chat message send failed:', error);
    return res.status(502).json({ error: 'Unable to send message' });
  }
});

module.exports = router;
