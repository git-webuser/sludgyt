/**
 * @typedef {Object} Settings
 * @property {string} ytDlpPath
 * @property {string} ffmpegPath
 * @property {string} cookiesFromBrowser
 * @property {string} defaultSaveDir
 */

/**
 * @typedef {'queued'|'downloading'|'sniffing'|'done'|'failed'|'cancelled'} QueueItemStatus
 */

/**
 * @typedef {Object} QueueItem
 * @property {string} id
 * @property {string} url
 * @property {string} filename
 * @property {string} saveDir
 * @property {string} quality
 * @property {QueueItemStatus} status
 * @property {number} percent
 * @property {string} [error]
 * @property {string|null} finalPath
 * @property {boolean} looksLikeRawManifest
 * @property {number} createdAt
 */

module.exports = {};
