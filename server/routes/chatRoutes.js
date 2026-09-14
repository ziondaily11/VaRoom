'use strict';

const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { ValidationError, assertAllowedKeys, text, uuid } = require('../lib/inputValidation');

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
  return Object.fromEntries((data || []).map((profile) => [profile.id, profile]));
}

router.get('/chat/conversations', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('id,listing_id,host_id,client_id,created_at,updated_at')
      .or(`host_id.eq.${user.id},client_id.eq.${user.id}`)
      .order('updated_at', { ascending: false });
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
      .select('id,conversation_id,sender_id,body,created_at,message_type,attachment_id,listing_id')
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

router.post('/chat/conversations/:conversationId/messages', async (req, res) => {
  try {
    const user = await authenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Invalid or expired session' });
    const conversationId = uuid(req.params.conversationId, 'conversation id');
    const conversation = await memberConversation(conversationId, user.id);
    if (!conversation) return res.status(403).json({ error: 'Conversation access denied' });
    assertAllowedKeys(req.body, ['content']);
    const content = text(req.body.content, 'content', { max: 10_000 });
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: user.id, body: content, message_type: 'text' })
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
