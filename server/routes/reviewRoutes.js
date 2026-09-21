const express = require('express');
const supabaseAdmin = require('../lib/supabaseClient');
const { createNotification } = require('../lib/notifications');
const { ValidationError, uuid, text, number } = require('../lib/inputValidation');
const router = express.Router();

async function loadReviewsWithClients(column, value) {
  const { data: rows, error } = await supabaseAdmin.from('reviews')
    .select('id,rating,comment,created_at,client_id')
    .eq(column, value)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const clientIds = [...new Set((rows || []).map((review) => review.client_id).filter(Boolean))];
  let clientsById = {};
  if (clientIds.length) {
    const { data: clients, error: clientsError } = await supabaseAdmin.from('profiles')
      .select('id,full_name,avatar_url')
      .in('id', clientIds);
    if (clientsError) console.warn('Review author profiles could not be loaded:', clientsError.message);
    clientsById = Object.fromEntries((clients || []).map((client) => [client.id, client]));
  }

  return (rows || []).map((review) => ({
    ...review,
    client: clientsById[review.client_id] || null,
  }));
}

// Submit a review for a booking (server-side validated)
router.post('/bookings/:bookingId/review', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing access token' });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired session' });

  try {
    const bookingId = uuid(req.params.bookingId, 'booking id');
    const rating = number(req.body.rating, 'rating', { integer: true, min: 1, max: 5 });
    const comment = text(req.body.comment, 'comment', { min: 1, max: 10000 });

    // 1) Verify booking exists and belongs to this user and is eligible
    const { data: booking, error: bookingError } = await supabaseAdmin.from('bookings')
      .select('id, status, client_id, listing_id').eq('id', bookingId).maybeSingle();
    if (bookingError) return res.status(500).json({ error: 'Unable to lookup booking' });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (booking.client_id !== user.id) return res.status(403).json({ error: 'You are not the client on this booking' });
    if (!['approved', 'completed'].includes(booking.status)) return res.status(400).json({ error: 'Booking is not eligible for review' });

    // 2) Prevent duplicate review for the same booking
    const { data: existing, error: existingError } = await supabaseAdmin.from('reviews')
      .select('id').eq('booking_id', bookingId).limit(1).maybeSingle();
    if (existingError) return res.status(500).json({ error: 'Unable to check existing reviews' });
    if (existing) return res.status(409).json({ error: 'This booking has already been reviewed' });

    // 3) Lookup listing host
    const { data: listing, error: listingError } = await supabaseAdmin.from('listings')
      .select('id, host_id').eq('id', booking.listing_id).maybeSingle();
    if (listingError || !listing) return res.status(500).json({ error: 'Unable to verify listing/host' });

    // 4) Insert review using service role (server-side)
    const { data: created, error: insertError } = await supabaseAdmin.from('reviews').insert({
      booking_id: bookingId,
      listing_id: booking.listing_id,
      host_id: listing.host_id,
      client_id: user.id,
      rating,
      comment
    }).select('id,booking_id,listing_id,host_id,client_id,rating,comment,created_at').single();

    if (insertError) return res.status(502).json({ error: 'Unable to create review' });

    const { data: profile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const listingName = (await supabaseAdmin.from('listings').select('title').eq('id', booking.listing_id).maybeSingle()).data?.title || 'your listing';

    await createNotification({
      recipientUserId: listing.host_id,
      actorUserId: user.id,
      type: 'new_review',
      title: 'New review',
      message: `${profile?.full_name || 'A guest'} left a ${rating}-star review for ${listingName}.`,
      relatedEntityType: 'review',
      relatedEntityId: created.id,
      metadata: { rating, booking_id: bookingId, listing_id: booking.listing_id, listing_name: listingName },
      bookingId,
      eventKey: `review:${created.id}:host`,
    });

    await createNotification({
      recipientUserId: user.id,
      actorUserId: user.id,
      type: 'review_published',
      title: 'Review published',
      message: `Your review for ${listingName} is now published.`,
      relatedEntityType: 'review',
      relatedEntityId: created.id,
      metadata: { rating, booking_id: bookingId, listing_id: booking.listing_id, listing_name: listingName },
      bookingId,
      eventKey: `review:${created.id}:client`,
    });

    // 5) Return created review. Frontend can refresh aggregates via separate endpoints.
    return res.status(201).json({ review: created });
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    console.error('Review submission failed', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get reviews for a listing, plus aggregate summary
router.get('/listings/:id/reviews', async (req, res) => {
  try {
    const listingId = uuid(req.params.id, 'listing id');
    const rows = await loadReviewsWithClients('listing_id', listingId);

    const reviewCount = (rows || []).length;
    const avg = reviewCount ? (rows.reduce((s, r) => s + Number(r.rating || 0), 0) / reviewCount) : null;
    const distribution = [5,4,3,2,1].map((star) => ({ star, count: (rows || []).filter(r => Number(r.rating) === star).length }));

    return res.json({ reviews: rows || [], summary: { average_rating: avg, review_count: reviewCount, distribution } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get reviews for a host across listings, plus aggregate summary
router.get('/hosts/:id/reviews', async (req, res) => {
  try {
    const hostId = uuid(req.params.id, 'host id');
    const rows = await loadReviewsWithClients('host_id', hostId);

    const reviewCount = (rows || []).length;
    const avg = reviewCount ? (rows.reduce((s, r) => s + Number(r.rating || 0), 0) / reviewCount) : null;
    const distribution = [5,4,3,2,1].map((star) => ({ star, count: (rows || []).filter(r => Number(r.rating) === star).length }));

    return res.json({ reviews: rows || [], summary: { average_rating: avg, review_count: reviewCount, distribution } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
