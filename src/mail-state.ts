// The demo starts with three genuinely unread incoming mails. Opening one
// records its source version as read, independently of reply/task status.
const initiallyUnread = new Set(['meeting-coordination', 'project-status', 'informational-update']);
export function mailIsUnread(
  mail: { id: string; version: string },
  readVersions: Record<string, boolean>,
) {
  return initiallyUnread.has(mail.id) && readVersions[`${mail.id}.${mail.version}`] !== true;
}
