// Shared helper for serving a note's full content as a file download.

// Turn a note title into a safe filename base (no extension).
function sanitizeFilename(name) {
  const base = (name || '')
    .trim()
    .replace(/[^\w.\- ]+/g, '_') // drop path separators, quotes, etc.
    .replace(/\s+/g, ' ')
    .slice(0, 100)
    .trim();
  return base || 'note';
}

// Write `content` to the response as an attachment, choosing extension and
// MIME type from the note's format. Sets a UTF-8-safe Content-Disposition.
function sendNoteDownload(res, { title, content, format }) {
  const ext = format === 'markdown' ? 'md' : 'txt';
  const type = format === 'markdown' ? 'text/markdown' : 'text/plain';
  const filename = `${sanitizeFilename(title)}.${ext}`;
  const asciiName = filename.replace(/[^\x20-\x7e]/g, '_');
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(content || '');
}

module.exports = { sendNoteDownload, sanitizeFilename };
