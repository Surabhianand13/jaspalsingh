/* ============================================================
   controllers/contactController.js — Contact Form Submissions
   ============================================================ */

const { query } = require('../config/db');
const { sendContactNotification, sendContactAutoReply } = require('../services/emailService');

/* POST /api/contact — submit a contact message (public) */
const submit = async (req, res, next) => {
  try {
    const { name, email, message, subject } = req.body;

    // Validate
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'name, email and message are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (message.trim().length < 10) {
      return res.status(400).json({ error: 'Message is too short (minimum 10 characters).' });
    }
    if (message.trim().length > 5000) {
      return res.status(400).json({ error: 'Message is too long (maximum 5000 characters).' });
    }
    if (subject && subject.trim().length > 300) {
      return res.status(400).json({ error: 'Subject is too long (maximum 300 characters).' });
    }

    // Save to database
    const result = await query(
      `INSERT INTO contact_messages (name, email, subject, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, created_at`,
      [name.trim(), email.toLowerCase().trim(), subject ? subject.trim() || null : null, message.trim()]
    );

    const saved = result.rows[0];
    res.status(201).json({
      message: 'Message received. Dr. Jaspal Singh will read it personally.',
      id: saved.id,
    });

    /* Fire-and-forget emails — failures must never break the API response */
    const msgPayload = { ...saved, name, email, subject: subject ? subject.trim() : null, message: message.trim() };
    sendContactNotification(msgPayload).catch(() => {});
    sendContactAutoReply(msgPayload).catch(() => {});
  } catch (err) {
    next(err);
  }
};

/* GET /api/contact — list all messages (admin only) */
const getAll = async (req, res, next) => {
  try {
    const { unread } = req.query;
    const where = unread === 'true' ? 'WHERE is_read = FALSE' : '';

    const result = await query(
      `SELECT id, name, email, subject, message, is_read, created_at
       FROM contact_messages ${where}
       ORDER BY created_at DESC`
    );

    const unreadCount = await query(
      'SELECT COUNT(*) FROM contact_messages WHERE is_read = FALSE'
    );

    res.json({
      total: result.rowCount,
      unread_count: parseInt(unreadCount.rows[0].count, 10),
      messages: result.rows,
    });
  } catch (err) {
    next(err);
  }
};

/* PUT /api/contact/:id/read — mark message as read (admin only) */
const markRead = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE contact_messages SET is_read = TRUE
       WHERE id = $1 RETURNING id, name, is_read`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }
    res.json({ message: 'Marked as read.', contact: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/* DELETE /api/contact/:id (admin only) */
const remove = async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM contact_messages WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }
    res.json({ message: 'Message deleted.', contact: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = { submit, getAll, markRead, remove };
