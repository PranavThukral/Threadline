import { useState } from 'react';
import { MailPlus, X } from 'lucide-react';

export type NewMailInput = {
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
};
export function MailComposer({
  onClose,
  onAdd,
  liveEnabled,
}: {
  onClose: () => void;
  onAdd: (input: NewMailInput) => Promise<void>;
  liveEnabled: boolean;
}) {
  const [input, setInput] = useState<NewMailInput>({
    senderName: '',
    senderEmail: '',
    subject: '',
    body: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof NewMailInput, value: string) =>
    setInput((current) => ({ ...current, [key]: value }));
  return (
    <div
      className="modal-backdrop"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <section
        className="mail-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mail-composer-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (busy && event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className="dialog-head">
          <div>
            <span className="eyebrow">Try your own mail</span>
            <h2 id="mail-composer-title">New mail</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close new mail"
          >
            <X size={20} />
          </button>
        </div>
        <p className="dialog-intro">
          Paste an email below. Threadline will read it, find the requests, and help you reply.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await onAdd(input);
            } catch (error) {
              setError(error instanceof Error ? error.message : 'Could not add this mail.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="sender-fields">
              <label>
                From
                <input
                  autoComplete="off"
                  placeholder="Taylor Morgan"
                  value={input.senderName}
                  onChange={(event) => update('senderName', event.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="off"
                  placeholder="taylor@example.com"
                  value={input.senderEmail}
                  onChange={(event) => update('senderEmail', event.target.value)}
                  required
                  maxLength={160}
                />
              </label>
            </div>
            <label>
              Subject
              <input
                placeholder="What’s this mail about?"
                value={input.subject}
                onChange={(event) => update('subject', event.target.value)}
                required
                maxLength={160}
              />
            </label>
            <label>
              Message
              <textarea
                placeholder="Paste or write the incoming mail…"
                value={input.body}
                onChange={(event) => update('body', event.target.value)}
                required
                maxLength={10000}
                rows={8}
              />
            </label>
          </fieldset>
          <p className="privacy-note">
            Use example content. Live requests go to the configured AI provider. Avoid private
            information. Added mails expire after 24 hours; reset removes them.
          </p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-footer">
            <button type="button" className="quiet-button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              <MailPlus size={16} />
              {busy ? 'Adding mail…' : liveEnabled ? 'Add mail & fetch overview' : 'Add mail'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
