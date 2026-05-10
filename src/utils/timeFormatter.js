/**
 * Format timestamp ke relative time
 * @param {Date|number} timestamp
 * @returns {string} e.g., "just now", "5 min ago", "2 hours ago"
 */
export const formatRelativeTime = (timestamp) => {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = Math.floor((now - date) / 1000); // difference in seconds

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  
  return date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
};

/**
 * Format timestamp ke jam:menit
 * @param {Date|number} timestamp
 * @returns {string} e.g., "14:30"
 */
export const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Hitung estimated response time berdasarkan conversation length
 * @param {number} historyLength
 * @returns {number} estimated time in seconds
 */
export const estimateWaitTime = (historyLength) => {
  // Base time: 2-5 seconds, increases slightly with history length
  const base = 2 + Math.random() * 3;
  const additionalPerMessage = 0.1;
  return Math.ceil(base + historyLength * additionalPerMessage);
};
