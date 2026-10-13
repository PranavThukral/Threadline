import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Info,
  Keyboard,
  LoaderCircle,
  Mail,
  Inbox,
  MailPlus,
  MessageCircleQuestion,
  Play,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  TimerReset,
  TriangleAlert,
  Undo2,
  X,
  Zap,
} from 'lucide-react';
import type { Extraction, Message, Participant, SourceMode, Thread, Evidence } from './domain.js';
import { viewer } from './viewer.js';
import { Avatar } from './avatar.js';
import { mailIsUnread } from './mail-state.js';
import { MailComposer, type NewMailInput } from './mail-composer.js';
import { workspaceStorage } from './local-state.js';
import { api, stream, setOffline, isOffline } from './transport.js';
import { extractionSchema, evidenceSchema } from './contracts.js';
import {
  businessFollowUp,
  businessFollowUpFrom,
  formatDate,
  recipientFor,
  lintDraft,
  replyInputKey,
  reminderAtNine,
  formatTimestamp,
  deadlineOverdue,
  scenarioInstant,
} from './workflow.js';

type Bootstrap = {
  liveEnabled: boolean;
  disabledReason: string | null;
  userTimezoneDefault: string;
  modelSnapshot: string;
  scenarioClockBase: string;
};
type ThreadSummary = Pick<
  Thread,
  'id' | 'subject' | 'preview' | 'latestSender' | 'category' | 'version'
> & { messageCount: number; responseState?: 'yes' | 'no' | 'unclear' };
const persist = (key: string, value: unknown) => {
  try {
    workspaceStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
const senderName = (participants: Participant[], id: string | null) =>
  participants.find((participant) => participant.id === id)?.name ?? 'Unknown sender';
const ownerLabel = (participants: Participant[], owner: { label: string | null; kind: string }) =>
  owner.label ?? (owner.kind === 'viewer' ? 'You' : 'Unknown owner');

function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [threadList, setThreadList] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState('recruiter-coordination');
  const [thread, setThread] = useState<Thread | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [mode, setMode] = useState<SourceMode>('recorded');
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [draftComplete, setDraftComplete] = useState(false);
  const [partialEdited, setPartialEdited] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [analysisState, setAnalysisState] = useState<'idle' | 'running' | 'failed'>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [threadQuery, setThreadQuery] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [briefSection, setBriefSection] = useState<
    'summary' | 'actions' | 'questions' | 'dates' | 'decisions' | 'none'
  >('actions');
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyIntent, setReplyIntent] = useState<'acknowledge' | 'answer' | 'clarify'>('answer');
  const [facts, setFacts] = useState('');
  const [draft, setDraft] = useState('');
  const [draftInputKey, setDraftInputKey] = useState<string | null>(null);
  const draftOutdated = Boolean(draft && draftInputKey !== replyInputKey(replyIntent, facts));
  const needsDraftGeneration = !draft.trim() || draftOutdated;
  const [draftState, setDraftState] = useState<
    'idle' | 'streaming' | 'editable' | 'reviewed' | 'blocked' | 'cancelled'
  >('idle');
  const [draftSource, setDraftSource] = useState<SourceMode>('recorded');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [undoHistory, setUndoHistory] = useState<
    Array<{
      threadId: string;
      version: string;
      actions: string[];
      dismissed: string[];
      disposition: Record<string, boolean>;
      reminders: Record<string, string>;
    }>
  >([]);
  const [dismissedItems, setDismissedItems] = useState<string[]>([]);
  const [doneForNow, setDoneForNow] = useState<Record<string, boolean>>({});
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const [followUpPreview, setFollowUpPreview] = useState<string | null>(null);
  const [showPerformance, setShowPerformance] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [newMailOpen, setNewMailOpen] = useState(false);
  const [fetchRequestedId, setFetchRequestedId] = useState<string | null>(null);
  const [mailFolder, setMailFolder] = useState<'inbox' | 'reply' | 'followups'>('inbox');
  const [readVersions, setReadVersions] = useState<Record<string, boolean>>({});
  const [performanceEvents, setPerformanceEvents] = useState<Array<Record<string, any>>>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [scenarioOffset, setScenarioOffset] = useState(0);
  const scenarioNow = useMemo(
    () =>
      thread?.id.startsWith('mail-') ? new Date().toISOString() : scenarioInstant(scenarioOffset),
    [scenarioOffset, thread?.id],
  );
  const [focusedEvidence, setFocusedEvidence] = useState<string | null>(null);
  const [focusedSpan, setFocusedSpan] = useState<{ start: number; end: number } | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const contextRef = useRef(0);
  const factsRef = useRef<HTMLTextAreaElement>(null);
  const workflowStartedRef = useRef<number | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadRequestRef = useRef(0);
  const modeRef = useRef<SourceMode>(mode);
  const paletteInputRef = useRef<HTMLInputElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const draftsRef = useRef(
    new Map<
      string,
      {
        text: string;
        facts: string;
        intent: 'acknowledge' | 'answer' | 'clarify';
        source: SourceMode;
        complete: boolean;
        edited: boolean;
        inputKey: string | null;
      }
    >(),
  );

  const visibleThreads = threadList
    .filter(
      (item) =>
        `${item.latestSender} ${item.subject} ${item.preview}`
          .toLowerCase()
          .includes(threadQuery.trim().toLowerCase()) &&
        (mailFolder === 'inbox' ||
          (mailFolder === 'reply' ? item.responseState === 'yes' : Boolean(followUps[item.id]))),
    )
    .sort(
      (left, right) =>
        Number(mailIsUnread(right, readVersions)) - Number(mailIsUnread(left, readVersions)),
    );
  const closeGuide = useCallback(() => {
    setShowGuide(false);
    setGuideDismissed(true);
    persist('threadline.guide.closed.v1', true);
  }, []);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const recordMetric = useCallback(
    (operation: string, durationMs: number, source: string = modeRef.current) => {
      const event = {
        id: crypto.randomUUID(),
        operation,
        durationMs,
        source,
        cacheLayer: source === 'recorded' ? 'recorded_bundle' : 'none',
        success: true,
        measuredAt: Date.now(),
        profileId: 'local-interaction',
      };
      setPerformanceEvents((current) => [...current.slice(-49), event]);
      if (isOffline()) return;
      void fetch('/api/v1/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [event] }),
      }).catch(() => undefined);
    },
    [],
  );

  const loadThread = useCallback(
    async (id: string, sourceOverride?: SourceMode) => {
      const started = performance.now();
      const requestNo = ++loadRequestRef.current;
      loadAbortRef.current?.abort();
      abortRef.current?.abort();
      analysisAbortRef.current?.abort();
      contextRef.current += 1;
      setAnalysisState('idle');
      setAnalysisError(null);
      setFollowUpPreview(null);
      const controller = new AbortController();
      loadAbortRef.current = controller;
      setLoading(true);
      try {
        const detail = await api<{ thread: Thread; evidence: Evidence[] }>(
          `/api/v1/threads/${id}`,
          { signal: controller.signal },
        );
        const source = sourceOverride ?? modeRef.current;
        let intelligence = await api<{
          state: 'ready' | 'missing';
          extraction: Extraction | null;
          evidence?: Evidence[];
        }>(
          `/api/v1/threads/${id}/intelligence?version=${encodeURIComponent(
            detail.thread.version,
          )}&source=${source}`,
          { signal: controller.signal },
        );
        if (requestNo !== loadRequestRef.current) return;
        if (!intelligence.extraction)
          intelligence = await api(`/api/v1/threads/${id}/intelligence?source=recorded`, {
            signal: controller.signal,
          });
        if (
          !intelligence.extraction ||
          !extractionSchema.safeParse(intelligence.extraction).success
        )
          throw new Error('This brief could not be validated.');
        if (controller.signal.aborted || requestNo !== loadRequestRef.current) return;
        setThread(detail.thread);
        setEvidence(intelligence.evidence ?? detail.evidence);
        setExtraction(intelligence.extraction);
        setSelectedId(id);
        setReadVersions((current) => {
          const next = { ...current, [`${id}.${detail.thread.version}`]: true };
          persist('threadline.read.v1', next);
          return next;
        });
        setReplyOpen(false);
        setDraft('');
        setDraftInputKey(null);
        setDraftComplete(false);
        setPartialEdited(false);
        setDraftState('idle');
        setDraftError(null);
        setFacts('');
        setFocusedEvidence(null);
        setFocusedSpan(null);
        setExpandedMessages([]);
        setBriefSection(
          intelligence.extraction.actions.length
            ? 'actions'
            : intelligence.extraction.followUp.state === 'recommended'
              ? 'summary'
              : intelligence.extraction.questions.length
                ? 'questions'
                : intelligence.extraction.deadlines.length
                  ? 'dates'
                  : 'decisions',
        );
        try {
          const storedDone = JSON.parse(
            workspaceStorage.getItem(`threadline.done.${id}.${detail.thread.version}`) ?? '[]',
          ) as unknown;
          const dismissed = JSON.parse(
            workspaceStorage.getItem(`threadline.dismissed.${id}.${detail.thread.version}`) ?? '[]',
          ) as unknown;
          setDismissedItems(
            Array.isArray(dismissed)
              ? dismissed.filter((item): item is string => typeof item === 'string')
              : [],
          );
          setCompletedItems(
            Array.isArray(storedDone)
              ? storedDone.filter((item): item is string => typeof item === 'string')
              : [],
          );
        } catch {
          setCompletedItems([]);
          setDismissedItems([]);
        }
        try {
          const dispositions = JSON.parse(
            workspaceStorage.getItem('threadline.disposition.v1') ?? '{}',
          ) as Record<string, unknown>;
          setDoneForNow(
            Object.fromEntries(
              Object.entries(dispositions).filter(([, value]) => value === true),
            ) as Record<string, boolean>,
          );
        } catch {
          setDoneForNow({});
        }
        try {
          const saved = draftsRef.current.get(`${id}.${detail.thread.version}`);
          if (
            saved &&
            typeof saved.text === 'string' &&
            saved.text.length <= 8000 &&
            ['acknowledge', 'answer', 'clarify'].includes(saved.intent)
          ) {
            setDraft(saved.text);
            setDraftInputKey(saved.inputKey);
            setReplyIntent(saved.intent);
            setDraftState(saved.text ? 'editable' : 'idle');
            setFacts(
              typeof saved.facts === 'string' && saved.facts.length <= 2000 ? saved.facts : '',
            );
            setDraftComplete(saved.complete === true);
            setPartialEdited(saved.edited === true);
            setDraftSource(saved.source === 'live' ? 'live' : 'recorded');
          }
        } catch {
          /* Corrupt local drafts do not block source review. */
        }
        recordMetric(
          'ui.thread_switch',
          performance.now() - started,
          intelligence.extraction.source,
        );
      } catch (error) {
        if ((error as Error).name !== 'AbortError' && requestNo === loadRequestRef.current) {
          setBootstrapError(error instanceof Error ? error.message : 'Could not load thread');
          setToast(error instanceof Error ? error.message : 'Could not load thread');
        }
      } finally {
        if (requestNo === loadRequestRef.current) setLoading(false);
      }
    },
    [recordMetric],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        await workspaceStorage.ready();
        setGuideDismissed(workspaceStorage.getItem('threadline.guide.closed.v1') === 'true');
        try {
          const savedRead = JSON.parse(
            workspaceStorage.getItem('threadline.read.v1') ?? '{}',
          ) as unknown;
          setReadVersions(
            savedRead && typeof savedRead === 'object' && !Array.isArray(savedRead)
              ? Object.fromEntries(Object.entries(savedRead).filter(([, value]) => value === true))
              : {},
          );
        } catch {
          setReadVersions({});
        }
        // Migrate older builds away from persisting user-entered content.
        for (const key of workspaceStorage.keys())
          if (key.startsWith('threadline.draft.')) workspaceStorage.removeItem(key);
        const savedOffset = Number(workspaceStorage.getItem('threadline.clock.v1') ?? '0');
        if (Number.isInteger(savedOffset) && savedOffset >= 0 && savedOffset <= 365)
          setScenarioOffset(savedOffset);
        setOffline(false);
        try {
          await api('/api/v1/session', { method: 'POST', body: '{}' });
        } catch {
          if (cancelled) return;
          setOffline(true);
          setOfflineMode(true);
        }
        if (!isOffline()) setOfflineMode(false);
        const [nextBootstrap, nextThreads] = await Promise.all([
          api<Bootstrap>('/api/v1/bootstrap'),
          api<{ threads: ThreadSummary[] }>('/api/v1/threads'),
        ]);
        if (cancelled) return;
        setBootstrap(nextBootstrap);
        modeRef.current = nextBootstrap.liveEnabled ? 'live' : 'recorded';
        setMode(modeRef.current);
        setThreadList(nextThreads.threads);
        setBootstrapError(null);
        await loadThread('recruiter-coordination', 'recorded');
      } catch (error) {
        if (cancelled) return;
        setBootstrapError(
          error instanceof Error
            ? error.message
            : 'The local API is unavailable. Run the development server to continue.',
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      loadAbortRef.current?.abort();
      abortRef.current?.abort();
      analysisAbortRef.current?.abort();
    };
  }, [bootstrapAttempt, loadThread]);

  useEffect(() => {
    if (toast) {
      const timer = window.setTimeout(() => setToast(null), 3800);
      return () => window.clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    void workspaceStorage.ready().then(() => {
      try {
        const saved = JSON.parse(
          workspaceStorage.getItem('threadline.followups.v1') ?? '{}',
        ) as unknown;
        if (saved && typeof saved === 'object') {
          const next: Record<string, string> = {};
          for (const [id, due] of Object.entries(saved as Record<string, unknown>)) {
            if (typeof due === 'string' && Number.isFinite(Date.parse(due))) next[id] = due;
          }
          setFollowUps(next);
        }
      } catch {
        setFollowUps({});
      }
    });
  }, []);

  useEffect(() => {
    if (!thread || draftState === 'streaming' || loading) return;
    draftsRef.current.set(`${thread.id}.${thread.version}`, {
      text: draft,
      facts,
      intent: replyIntent,
      source: draftSource,
      complete: draftComplete,
      edited: partialEdited,
      inputKey: draftInputKey,
    });
  }, [
    thread,
    loading,
    draft,
    draftState,
    facts,
    replyIntent,
    draftSource,
    draftComplete,
    partialEdited,
    draftInputKey,
  ]);
  useEffect(() => {
    const failure = () =>
      setToast('Browser storage is unavailable. Local changes may not survive reload.');
    window.addEventListener('threadline-storage-failed', failure);
    return () => window.removeEventListener('threadline-storage-failed', failure);
  }, []);

  const openReply = useCallback(() => {
    if (!thread || loading) return;
    setReplyOpen(true);
    if (!draft) {
      setReplyIntent('answer');
      setTimeout(() => factsRef.current?.focus(), 0);
    } else setTimeout(() => replyRef.current?.focus(), 0);
  }, [draft, loading, thread]);

  const reconnectLiveAI = async () => {
    const wasOffline = isOffline();
    let connected = false;
    setOffline(false);
    try {
      await api('/api/v1/session', { method: 'POST', body: '{}' });
      const next = await api<Bootstrap>('/api/v1/bootstrap');
      connected = true;
      setBootstrap(next);
      setOfflineMode(false);
      modeRef.current = next.liveEnabled ? 'live' : 'recorded';
      setMode(modeRef.current);
      if (!next.liveEnabled) throw new Error(next.disabledReason ?? 'Live AI is unavailable.');
      setThreadList((await api<{ threads: ThreadSummary[] }>('/api/v1/threads')).threads);
      setDraftError(null);
      setToast('Live AI reconnected. Generate a reply from your notes.');
    } catch (error) {
      setOffline(wasOffline && !connected);
      setOfflineMode(wasOffline && !connected);
      setDraftError(error instanceof Error ? error.message : 'Live AI could not reconnect.');
    }
  };

  const startReply = useCallback(
    async (intent: 'acknowledge' | 'answer' | 'clarify' = replyIntent) => {
      if (!thread || loading) return;
      if (!recipientFor(thread).length) {
        setToast('Recipient identity is incomplete. Review the source.');
        return;
      }
      if (intent === 'answer' && !facts.trim()) {
        setReplyOpen(true);
        setReplyIntent('answer');
        setDraftSource(mode);
        setTimeout(() => factsRef.current?.focus(), 0);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestContext = contextRef.current;
      const requestThreadId = thread.id;
      const requestVersion = thread.version;
      const requestMode = mode;
      const requestFacts = facts
        .split('\n')
        .map((fact) => fact.trim())
        .filter(Boolean);
      if (requestFacts.length > 5 || requestFacts.some((f) => f.length > 300)) {
        setToast('Use up to five facts, each no longer than 300 characters.');
        return;
      }
      setReplyOpen(true);
      setReplyIntent(intent);
      setDraft('');
      setDraftInputKey(replyInputKey(intent, facts));
      setDraftState('streaming');
      setDraftComplete(false);
      setPartialEdited(false);
      workflowStartedRef.current = performance.now();
      setDraftError(null);
      setDraftSource(requestMode);
      setTimeout(() => replyRef.current?.focus(), 0);
      const started = performance.now();
      try {
        await stream(
          `/api/v1/threads/${requestThreadId}/replies`,
          {
            threadVersion: requestVersion,
            intent,
            facts: intent === 'answer' ? requestFacts : [],
            mode: requestMode,
          },
          (event) => {
            if (
              event.threadId !== requestThreadId ||
              event.threadVersion !== requestVersion ||
              event.mode !== requestMode ||
              controller !== abortRef.current ||
              controller.signal.aborted ||
              requestContext !== contextRef.current
            )
              return;
            if (event.type === 'draft.delta')
              setDraft((current) => current + String(event.payload.text ?? ''));
            if (event.type === 'draft.completed') {
              setDraft(String(event.payload.text ?? ''));
              setDraftComplete(true);
              setDraftError((event.payload.lintFlags ?? []).join(' ') || null);
              setDraftState((event.payload.lintFlags ?? []).length ? 'blocked' : 'editable');
              recordMetric('reply.usable', performance.now() - started, requestMode);
            }
            if (event.type === 'run.cancelled') setDraftState('cancelled');
            if (event.type === 'run.failed') {
              setDraftState('blocked');
              setDraftError(String(event.payload.message ?? 'Draft failed'));
            }
          },
          controller.signal,
        );
      } catch (error) {
        if (
          controller !== abortRef.current ||
          controller.signal.aborted ||
          requestContext !== contextRef.current
        )
          return;
        if (error instanceof Error && error.message === 'STREAM_INTERRUPTED') {
          setDraftState('cancelled');
          setDraftError(
            'The connection ended before the draft was complete. Review the partial text.',
          );
        } else {
          setDraftState('blocked');
          setDraftError(error instanceof Error ? error.message : 'Draft generation failed');
        }
      }
    },
    [facts, mode, recordMetric, replyIntent, thread, loading],
  );

  const cancelReply = () => {
    abortRef.current?.abort();
    setDraftState('cancelled');
    setDraftComplete(false);
    setPartialEdited(false);
    setToast('Generation cancelled. The partial draft remains editable.');
  };
  const closeReply = () => {
    if (draftState === 'streaming') cancelReply();
    setReplyOpen(false);
  };
  const markReviewedOrCopy = async () => {
    if (draftOutdated) {
      setDraftError('Your notes or reply type changed. Update the draft before reviewing.');
      return;
    }
    const flags = lintDraft(
      draft,
      facts
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean),
    );
    if (flags.length || (!draftComplete && !partialEdited)) {
      setDraftError(flags.join(' ') || 'Edit the incomplete draft before reviewing.');
      return;
    }
    if (draftState === 'editable' || draftState === 'cancelled') {
      setDraftState('reviewed');
      setToast('Reviewed. Press Mod+Enter again to copy.');
      return;
    }
    if (draftState === 'reviewed') {
      try {
        await navigator.clipboard.writeText(draft);
        setToast('Reply copied.');
        recordMetric(
          'workflow.copy',
          performance.now() - (workflowStartedRef.current ?? performance.now()),
          draftSource,
        );
        setDraftState('reviewed');
      } catch {
        setToast('Clipboard unavailable. Select the reviewed draft and copy it manually.');
      }
    }
  };

  const calculateFollowUpDue = () =>
    thread?.id.startsWith('mail-')
      ? businessFollowUpFrom(new Date().toISOString())
      : businessFollowUp(scenarioOffset);

  const saveFollowUp = () => {
    if (!thread || !extraction) return;
    if (extraction.followUp.state !== 'recommended') {
      setToast('No follow-up is recommended for this mail.');
      return;
    }
    workflowStartedRef.current = performance.now();
    setBriefSection('summary');
    setFollowUpPreview(calculateFollowUpDue());
    setToast('Review the follow-up time, then confirm it.');
  };

  const confirmFollowUp = () => {
    if (!thread || !followUpPreview) return;
    saveUndo();
    const due = followUpPreview;
    persist(`threadline.followup-version.${thread.id}`, thread.version);
    setFollowUps((current) => {
      const next = { ...current, [thread.id]: due };
      try {
        workspaceStorage.setItem('threadline.followups.v1', JSON.stringify(next));
      } catch {
        setToast('Browser storage is unavailable. This reminder will last for this session.');
      }
      return next;
    });
    setFollowUpPreview(null);
    setToast(`Local follow-up saved for ${formatDate(due)} at 9 AM New York.`);
    recordMetric(
      'workflow.followup',
      performance.now() - (workflowStartedRef.current ?? performance.now()),
      'deterministic',
    );
  };

  const saveUndo = () => {
    if (!thread) return;
    setUndoHistory((current) => [
      ...current.slice(-19),
      {
        threadId: thread.id,
        version: thread.version,
        actions: completedItems,
        dismissed: dismissedItems,
        disposition: doneForNow,
        reminders: followUps,
      },
    ]);
  };
  const completeAction = (id: string) => {
    if (!thread || loading) return;
    saveUndo();
    const next = completedItems.includes(id)
      ? completedItems.filter((item) => item !== id)
      : [...completedItems, id];
    setCompletedItems(next);
    if (!persist(`threadline.done.${thread.id}.${thread.version}`, next))
      setToast('Browser storage is unavailable. Changes last for this session.');
  };
  const dismissAction = (id: string) => {
    if (!thread || loading) return;
    saveUndo();
    const next = dismissedItems.includes(id)
      ? dismissedItems.filter((item) => item !== id)
      : [...dismissedItems, id];
    setDismissedItems(next);
    persist(`threadline.dismissed.${thread.id}.${thread.version}`, next);
  };
  const undoLast = () => {
    const previous = undoHistory.at(-1);
    if (!previous) {
      setToast('No local changes to undo.');
      return;
    }
    setUndoHistory((current) => current.slice(0, -1));
    persist(`threadline.done.${previous.threadId}.${previous.version}`, previous.actions);
    persist(`threadline.dismissed.${previous.threadId}.${previous.version}`, previous.dismissed);
    persist('threadline.disposition.v1', previous.disposition);
    persist('threadline.followups.v1', previous.reminders);
    if (thread?.id === previous.threadId && thread.version === previous.version) {
      setCompletedItems(previous.actions);
      setDismissedItems(previous.dismissed);
    }
    setDoneForNow(previous.disposition);
    setFollowUps(previous.reminders);
    setToast('Last local change undone.');
  };
  const markDoneForNow = () => {
    if (!thread || extraction?.response.state !== 'no') {
      setToast('Resolve this mail’s request before marking it done.');
      return;
    }
    saveUndo();
    const key = `${thread.id}.${thread.version}`;
    const next = { ...doneForNow, [key]: !doneForNow[key] };
    setDoneForNow(next);
    persist('threadline.disposition.v1', next);
    setToast(next[key] ? 'Marked done for now. The source remains available.' : 'Mail reopened.');
  };
  const removeFollowUp = () => {
    if (!thread) return;
    saveUndo();
    const next = { ...followUps };
    delete next[thread.id];
    setFollowUps(next);
    persist('threadline.followups.v1', next);
    setToast('Local follow-up removed. Press U to undo.');
  };

  const appendReply = async () => {
    if (!thread || loading) return;
    contextRef.current += 1;
    abortRef.current?.abort();
    analysisAbortRef.current?.abort();
    try {
      await api(`/api/v1/threads/${thread.id}/append`, {
        method: 'POST',
        body: JSON.stringify({ threadVersion: thread.version, scenario: 'reply_received' }),
      });
      modeRef.current = bootstrap?.liveEnabled ? 'live' : 'recorded';
      setMode(modeRef.current);
      const list = await api<{ threads: ThreadSummary[] }>('/api/v1/threads');
      setThreadList(list.threads);
      await loadThread(thread.id, 'recorded');
      const nextOffset = Math.max(scenarioOffset, 1);
      setScenarioOffset(nextOffset);
      persist('threadline.clock.v1', nextOffset);
      setToast('Reply added. The overview now reflects the new request.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not append the scenario.');
    }
  };

  const resetDemo = () => {
    try {
      for (const key of workspaceStorage.keys()) {
        if (key.startsWith('threadline.') && key !== 'threadline.guide.closed.v1')
          workspaceStorage.removeItem(key);
      }
    } catch {
      /* Session reset remains available. */
    }
    setCompletedItems([]);
    setFollowUps({});
    setDoneForNow({});
    setUndoHistory([]);
    setDismissedItems([]);
    setScenarioOffset(0);
    setReadVersions({});
    modeRef.current = bootstrap?.liveEnabled ? 'live' : 'recorded';
    setMode(modeRef.current);
    contextRef.current += 1;
    analysisAbortRef.current?.abort();
    abortRef.current?.abort();
    setReplyOpen(false);
    setDraft('');
    setDraftInputKey(null);
    draftsRef.current.clear();
    setFacts('');
    setDraftState('idle');
    setFollowUpPreview(null);
    setToast('Local demo state reset.');
    void api('/api/v1/reset', { method: 'POST', body: '{}' })
      .then(async () => {
        const list = await api<{ threads: ThreadSummary[] }>('/api/v1/threads');
        setThreadList(list.threads);
        if (thread)
          await loadThread(
            thread.id.startsWith('mail-') ? 'recruiter-coordination' : thread.id,
            'recorded',
          );
      })
      .catch(() => setToast('Local decisions reset. Reconnect to reset the server scenario.'));
  };

  const analyzeSelected = useCallback(
    async (requestedMode: SourceMode = modeRef.current) => {
      if (!thread || loading) return;
      analysisAbortRef.current?.abort();
      const controller = new AbortController();
      analysisAbortRef.current = controller;
      const requestContext = contextRef.current;
      const started = performance.now();
      setAnalysisState('running');
      setAnalysisError(null);
      const current = () =>
        analysisAbortRef.current === controller &&
        !controller.signal.aborted &&
        contextRef.current === requestContext;
      try {
        await stream(
          `/api/v1/threads/${thread.id}/analyze`,
          { threadVersion: thread.version, mode: requestedMode },
          (event) => {
            if (!current()) return;
            if (event.type === 'analysis.completed') {
              const parsed = extractionSchema.safeParse(event.payload.extraction);
              const spans = event.payload.evidence as Evidence[];
              if (
                !parsed.success ||
                parsed.data.threadId !== thread.id ||
                parsed.data.threadVersion !== thread.version ||
                !Array.isArray(spans) ||
                spans.some((item) => !evidenceSchema.safeParse(item).success)
              )
                throw new Error('The new brief could not be validated.');
              setExtraction(parsed.data as Extraction);
              const nextBrief = parsed.data;
              setBriefSection(
                nextBrief.actions.length
                  ? 'actions'
                  : nextBrief.followUp.state === 'recommended'
                    ? 'summary'
                    : nextBrief.questions.length
                      ? 'questions'
                      : nextBrief.deadlines.length
                        ? 'dates'
                        : 'decisions',
              );
              setThreadList((current) =>
                current.map((item) =>
                  item.id === thread.id
                    ? { ...item, responseState: parsed.data.response.state }
                    : item,
                ),
              );
              setEvidence(spans);
              setAnalysisState('idle');
              recordMetric('analysis.completed', performance.now() - started, requestedMode);
            }
            if (event.type === 'run.failed') {
              setAnalysisState('failed');
              setAnalysisError(String(event.payload.message));
            }
            if (event.type === 'run.cancelled') setAnalysisState('idle');
          },
          controller.signal,
        );
      } catch (error) {
        if (current()) {
          setAnalysisState('failed');
          setAnalysisError(
            error instanceof Error ? error.message : 'Could not fetch this overview.',
          );
        }
      }
    },
    [recordMetric, thread, loading],
  );
  useEffect(() => {
    if (fetchRequestedId && thread?.id === fetchRequestedId && !loading) {
      setFetchRequestedId(null);
      void analyzeSelected('live');
    }
  }, [fetchRequestedId, thread?.id, loading, analyzeSelected]);
  const addMail = async (input: NewMailInput) => {
    if (offlineMode) throw new Error('Reconnect before adding mail.');
    const result = await api<{ thread: Thread }>('/api/v1/threads', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const list = await api<{ threads: ThreadSummary[] }>('/api/v1/threads');
    setThreadList(list.threads);
    setMailFolder('inbox');
    setThreadQuery('');
    setNewMailOpen(false);
    modeRef.current = bootstrap?.liveEnabled ? 'live' : 'recorded';
    setMode(modeRef.current);
    await loadThread(result.thread.id, 'recorded');
    if (bootstrap?.liveEnabled) setFetchRequestedId(result.thread.id);
  };

  const focusEvidence = useCallback(
    (evidenceId: string) => {
      const item = evidence.find((candidate) => candidate.id === evidenceId);
      if (!item) return;
      setFocusedEvidence(item.messageId);
      setFocusedSpan({ start: item.start, end: item.end });
      window.requestAnimationFrame(() => {
        const card = document.getElementById(item.messageId);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const body = card?.querySelector('.message-body') as HTMLElement | null;
        if (body) {
          body.tabIndex = -1;
          body.focus({ preventScroll: true });
        }
      });
    },
    [evidence],
  );

  const commands = useMemo(
    () => [
      {
        id: 'reply',
        label: 'Draft reply',
        shortcut: 'R',
        action: openReply,
      },
      {
        id: 'answer',
        label: 'Answer with my facts',
        shortcut: '⇧R',
        action: () => {
          setReplyOpen(true);
          setReplyIntent('answer');
          setTimeout(() => factsRef.current?.focus(), 0);
        },
      },
      {
        id: 'clarify',
        label: 'Ask for missing information',
        shortcut: 'C',
        action: () => void startReply('clarify'),
      },
      {
        id: 'tasks',
        label: 'View next actions',
        shortcut: 'A',
        action: () => setBriefSection('actions'),
      },
      {
        id: 'questions',
        label: 'View open questions',
        shortcut: 'Q',
        action: () => setBriefSection('questions'),
      },
      { id: 'followup', label: 'Save follow-up', shortcut: 'F', action: saveFollowUp },
      {
        id: 'analyze',
        label: 'Fetch overview',
        shortcut: 'L',
        action: () => void analyzeSelected(mode),
      },
      {
        id: 'performance',
        label: 'Show performance',
        shortcut: 'P',
        action: () => setShowPerformance(true),
      },
      { id: 'reset', label: 'Reset demo', shortcut: 'Palette', action: resetDemo },
      {
        id: 'advance',
        label: 'Advance scenario clock',
        shortcut: '',
        action: () => {
          const nextOffset = Math.min(scenarioOffset + 1, 365);
          setScenarioOffset(nextOffset);
          persist('threadline.clock.v1', nextOffset);
        },
      },
      {
        id: 'shortcuts',
        label: 'Show shortcuts',
        shortcut: '?',
        action: () => {
          if (!guideDismissed) setShowGuide(true);
        },
      },
    ],
    [
      analyzeSelected,
      mode,
      resetDemo,
      saveFollowUp,
      startReply,
      openReply,
      scenarioOffset,
      guideDismissed,
    ],
  );
  const filteredCommands = commands
    .filter((command) => command.id !== 'shortcuts' || !guideDismissed)
    .filter((command) =>
      `${command.label} ${command.id}`.toLowerCase().includes(paletteQuery.toLowerCase()),
    )
    .slice(0, 12);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      if (newMailOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setNewMailOpen(false);
        }
        return;
      }
      const target = event.target as HTMLElement;
      const editing =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowPerformance(false);
        if (showGuide) closeGuide();
        setPaletteOpen((open) => !open);
        return;
      }
      if (paletteOpen) {
        if (event.key === 'Escape') {
          setPaletteOpen(false);
          setPaletteQuery('');
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setPaletteIndex((index) => Math.min(index + 1, Math.max(filteredCommands.length - 1, 0)));
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setPaletteIndex((index) => Math.max(index - 1, 0));
          return;
        }
        if (event.key === 'Enter' && filteredCommands[paletteIndex]) {
          event.preventDefault();
          filteredCommands[paletteIndex].action();
          setPaletteOpen(false);
          setPaletteQuery('');
          return;
        }
        return;
      }
      if (showGuide) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeGuide();
        }
        return;
      }
      if (showPerformance) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setShowPerformance(false);
        }
        return;
      }
      if (editing) {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === 'Enter' &&
          (target === replyRef.current || target === factsRef.current)
        ) {
          event.preventDefault();
          if (target === factsRef.current) void startReply('answer');
          else void markReviewedOrCopy();
        }
        if (
          event.key === 'Escape' &&
          replyOpen &&
          (target === replyRef.current || target === factsRef.current)
        ) {
          event.preventDefault();
          if (draftState === 'streaming') cancelReply();
          else closeReply();
        }
        return;
      }
      if (event.key === 'Escape') {
        if (replyOpen) {
          closeReply();
          return;
        }
        if (showPerformance) {
          setShowPerformance(false);
          return;
        }
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const index = visibleThreads.findIndex((item) => item.id === selectedId);
        const next =
          event.key === 'j'
            ? Math.min(index + 1, visibleThreads.length - 1)
            : Math.max(index - 1, 0);
        if (visibleThreads[next]) void loadThread(visibleThreads[next].id);
        return;
      }
      if (event.key.toLowerCase() === 'r' && event.shiftKey) {
        event.preventDefault();
        setReplyOpen(true);
        setReplyIntent('answer');
        setTimeout(() => factsRef.current?.focus(), 0);
        return;
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (draft || draftState === 'streaming') {
          setReplyOpen(true);
          setTimeout(() => replyRef.current?.focus(), 0);
        } else {
          openReply();
        }
        return;
      }
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        void startReply('clarify');
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        saveFollowUp();
        return;
      }
      if (event.key === 'Enter' && followUpPreview) {
        event.preventDefault();
        confirmFollowUp();
        return;
      }
      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setBriefSection('actions');
        return;
      }
      if (event.key.toLowerCase() === 'q') {
        event.preventDefault();
        setBriefSection('questions');
        return;
      }
      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        void analyzeSelected(modeRef.current);
        return;
      }
      if (event.key.toLowerCase() === 'e') {
        event.preventDefault();
        markDoneForNow();
        return;
      }
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        undoLast();
        return;
      }
      if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        const firstEvidence = extraction?.summary[0]?.evidenceIds[0];
        if (firstEvidence) focusEvidence(firstEvidence);
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        const search = document.querySelector<HTMLInputElement>('.thread-search input');
        search?.focus();
        return;
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setShowPerformance(true);
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        if (!guideDismissed) setShowGuide(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    filteredCommands,
    loadThread,
    markReviewedOrCopy,
    paletteIndex,
    paletteOpen,
    replyOpen,
    showPerformance,
    showGuide,
    guideDismissed,
    newMailOpen,
    closeGuide,
    saveFollowUp,
    followUpPreview,
    confirmFollowUp,
    markDoneForNow,
    undoLast,
    analyzeSelected,
    draft,
    extraction,
    focusEvidence,
    selectedId,
    startReply,
    openReply,
    threadList,
  ]);

  useEffect(() => {
    if (!paletteOpen && !showPerformance && !showGuide && !newMailOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      newMailOpen
        ? '.mail-composer'
        : paletteOpen
          ? '.palette'
          : showGuide
            ? '.demo-guide'
            : '.performance-drawer',
    );
    const background = [
      ...document.querySelectorAll<HTMLElement>('.app-shell > :not(.modal-backdrop):not(.toast)'),
    ];
    background.forEach((node) => {
      node.inert = true;
    });
    const focusable = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ) ?? []),
    ];
    (newMailOpen ? dialog?.querySelector<HTMLInputElement>('input') : focusable()[0])?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const list = focusable(),
        first = list[0],
        last = list.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      background.forEach((node) => {
        node.inert = false;
      });
      document.removeEventListener('keydown', trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [paletteOpen, showPerformance, showGuide, newMailOpen]);

  if (loading && !thread)
    return (
      <div className="splash">
        <Sparkles size={20} />
        <span>Loading Threadline</span>
      </div>
    );
  if (bootstrapError && !thread)
    return (
      <div className="splash error-splash">
        <TriangleAlert size={20} />
        <strong>Threadline could not connect</strong>
        <span>{bootstrapError}</span>
        <button
          className="primary-button"
          onClick={() => setBootstrapAttempt((attempt) => attempt + 1)}
        >
          <RefreshCcw size={14} /> Retry
        </button>
      </div>
    );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Mail size={20} />
          </div>
          <span>threadline</span>
        </div>
        <span className="topbar-location">
          {mailFolder === 'inbox'
            ? 'Inbox'
            : mailFolder === 'reply'
              ? 'Needs a reply'
              : 'Follow-ups'}
        </span>
        <div className="top-actions">
          {!guideDismissed && (
            <button className="quiet-button" onClick={() => setShowGuide(true)}>
              Demo guide
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Open command palette"
            onClick={() => setPaletteOpen(true)}
          >
            <Keyboard size={16} />
            <span className="keycap">Ctrl K</span>
          </button>
          <Avatar name={viewer.name} className="account-avatar" />
        </div>
      </header>
      {offlineMode && (
        <div className="offline-banner" role="status">
          You’re offline. Sample mails and saved follow-ups are still available.{' '}
          <button onClick={() => void reconnectLiveAI()}>Reconnect</button>
        </div>
      )}
      <main className="workspace" aria-busy={loading}>
        <nav className="mail-rail" aria-label="Mail folders">
          <button
            className={mailFolder === 'inbox' ? 'selected' : ''}
            onClick={() => setMailFolder('inbox')}
            aria-label="Inbox"
            aria-pressed={mailFolder === 'inbox'}
            title="Inbox"
          >
            <Inbox size={21} />
            <span>Inbox</span>
          </button>
          <button
            className={mailFolder === 'reply' ? 'selected' : ''}
            onClick={() => setMailFolder('reply')}
            aria-label="Needs a reply"
            aria-pressed={mailFolder === 'reply'}
            title="Needs a reply"
          >
            <Mail size={21} />
            <span>To reply</span>
          </button>
          <button
            className={mailFolder === 'followups' ? 'selected' : ''}
            onClick={() => setMailFolder('followups')}
            aria-label="Follow-ups"
            aria-pressed={mailFolder === 'followups'}
            title="Follow-ups"
          >
            <Clock3 size={21} />
            <span>Follow-up</span>
          </button>
          <div className="rail-bottom">
            <button
              onClick={undoLast}
              disabled={!undoHistory.length}
              aria-label="Undo last local change"
              title="Undo (U)"
            >
              <Undo2 size={19} />
              <span>Undo</span>
            </button>
          </div>
        </nav>
        <aside className="thread-sidebar" aria-label="Mails">
          <div className="sidebar-heading">
            <h2>
              Mails <span className="count-pill">{visibleThreads.length}</span>
            </h2>
          </div>
          <button
            className="new-mail-button primary-button"
            onClick={() => setNewMailOpen(true)}
            disabled={offlineMode}
          >
            <MailPlus size={18} /> New mail
          </button>
          <div className="thread-search">
            <Search size={14} />
            <input
              aria-label="Search mails"
              value={threadQuery}
              onChange={(event) => setThreadQuery(event.target.value)}
              placeholder="Search mails"
            />
            <span className="keycap">/</span>
          </div>
          <div className="thread-list">
            {!visibleThreads.length && (
              <p className="empty-mail-list">
                {threadQuery
                  ? 'No mails match your search.'
                  : mailFolder === 'followups'
                    ? 'Saved follow-ups will appear here.'
                    : 'No mails need a reply.'}
              </p>
            )}
            {visibleThreads.map((item) => (
              <button
                key={item.id}
                className={`thread-row ${item.id === selectedId ? 'selected' : ''} ${mailIsUnread(item, readVersions) ? 'unread' : ''}`}
                aria-label={`${item.latestSender}: ${item.subject}${mailIsUnread(item, readVersions) ? ' (Unread)' : ''}`}
                aria-current={item.id === selectedId ? 'true' : undefined}
                onClick={() => void loadThread(item.id)}
              >
                <Avatar name={item.latestSender} className="thread-avatar" />
                <span className="thread-row-copy">
                  <strong className="mail-sender">
                    <span>{item.latestSender}</span>
                    {mailIsUnread(item, readVersions) && (
                      <span className="unread-dot" aria-hidden="true" />
                    )}
                  </strong>
                  <span>{item.subject}</span>
                  <small>{item.preview}</small>
                </span>
                {item.id === 'waiting-on-reply' && <Clock3 size={14} className="row-status" />}
              </button>
            ))}
          </div>
          <div className="sidebar-foot">
            <div className="sidebar-heading">
              <span>Saved follow-ups</span>
              <span className="count-pill">
                {threadList.filter((item) => followUps[item.id]).length}
              </span>
            </div>
            {Object.entries(followUps)
              .filter(([id]) => threadList.some((item) => item.id === id))
              .map(([id, due]) => (
                <button key={id} className="due-row" onClick={() => void loadThread(id)}>
                  <Clock3 size={14} />
                  <span>{threadList.find((item) => item.id === id)?.subject}</span>
                  <time>
                    {formatDate(due)}
                    {Date.parse(due) <= Date.parse(scenarioNow) ? ' · Due' : ''}
                  </time>
                </button>
              ))}
          </div>
        </aside>
        <section className="reader-column" aria-label="Mail reader">
          {thread ? (
            <>
              <div className="reader-header">
                <div className="reader-toolbar">
                  <span className="mail-category">{thread.category}</span>
                  <div>
                    <button
                      className="quiet-button"
                      onClick={() => {
                        if (!bootstrap?.liveEnabled) {
                          setToast(
                            'The AI connection is unavailable right now. Try again shortly.',
                          );
                          return;
                        }
                        void analyzeSelected('live');
                      }}
                      disabled={loading || analysisState === 'running'}
                      aria-label="Fetch overview"
                    >
                      <RefreshCcw size={16} className={analysisState === 'running' ? 'spin' : ''} />
                      {analysisState === 'running' ? 'Fetching…' : 'Fetch overview'}
                    </button>
                    {analysisState === 'running' && (
                      <button
                        className="text-button"
                        onClick={() => {
                          analysisAbortRef.current?.abort();
                          setAnalysisState('idle');
                        }}
                      >
                        Cancel fetch
                      </button>
                    )}
                  </div>
                </div>
                <h1>{thread.subject}</h1>
                <div className="participants">
                  <div className="avatar-stack">
                    {thread.participants.map((participant) => (
                      <Avatar
                        key={participant.id}
                        name={participant.name}
                        className="small-avatar"
                      />
                    ))}
                  </div>
                  <span>
                    {thread.participants.map((participant) => participant.name).join(', ')}
                  </span>
                </div>
                {thread.id === 'waiting-on-reply' && thread.messages.length === 1 && (
                  <button
                    className="scenario-button"
                    onClick={() => void appendReply()}
                    disabled={loading}
                  >
                    <Play size={14} /> Simulate Maya’s reply{' '}
                    <small>Update the source and next action</small>
                  </button>
                )}
              </div>
              <div className="message-scroll">
                {thread.messages.map((message) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    participants={thread.participants}
                    expanded={
                      focusedEvidence === message.id || expandedMessages.includes(message.id)
                    }
                    focused={focusedEvidence === message.id}
                    highlightSpan={focusedEvidence === message.id ? focusedSpan : null}
                    onReply={openReply}
                    onToggle={() => {
                      setExpandedMessages((current) =>
                        focusedEvidence === message.id || current.includes(message.id)
                          ? current.filter((id) => id !== message.id)
                          : [...current, message.id],
                      );
                      if (focusedEvidence === message.id) {
                        setFocusedEvidence(null);
                        setFocusedSpan(null);
                      }
                    }}
                  />
                ))}
              </div>
              {replyOpen && (
                <div className="reply-panel">
                  <div className="reply-panel-head">
                    <div>
                      <span className="eyebrow">Reply</span>
                      <strong>
                        To{' '}
                        {recipientFor(thread)
                          .map((id) => senderName(thread.participants, id))
                          .join(', ') || 'Recipient unresolved'}
                      </strong>
                    </div>
                    <div className="reply-actions">
                      <button className="icon-button" onClick={closeReply} aria-label="Close reply">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="intent-tabs">
                    {(['acknowledge', 'answer', 'clarify'] as const).map((intent) => (
                      <button
                        key={intent}
                        className={replyIntent === intent ? 'active' : ''}
                        disabled={draftState === 'streaming'}
                        onClick={() => {
                          setReplyIntent(intent);
                          setDraftState(draft ? 'editable' : 'idle');
                          if (intent === 'answer') setTimeout(() => factsRef.current?.focus(), 0);
                        }}
                      >
                        {intent === 'acknowledge'
                          ? 'Acknowledge'
                          : intent === 'answer'
                            ? 'Answer with facts'
                            : 'Ask a question'}
                      </button>
                    ))}
                  </div>
                  {replyIntent === 'answer' && (
                    <label className="reply-notes">
                      <span>Your notes</span>
                      <textarea
                        ref={factsRef}
                        aria-label="Facts for this reply"
                        className="facts-input"
                        placeholder="e.g. I’m busy this week. Early mornings would probably work better."
                        value={facts}
                        disabled={draftState === 'streaming'}
                        maxLength={2000}
                        onChange={(event) => {
                          setFacts(event.target.value);
                          if (draftState === 'reviewed') setDraftState('editable');
                        }}
                      />
                      <small>
                        Current availability, preferences and constraints take priority over earlier
                        mails.
                      </small>
                    </label>
                  )}
                  {draftOutdated && (
                    <div className="draft-outdated" role="status">
                      <RefreshCcw size={15} />
                      <span>
                        Your notes or reply type changed. Generate a new reply to use them.
                      </span>
                    </div>
                  )}
                  {draftError && (
                    <div className="inline-error">
                      <TriangleAlert size={14} />
                      {draftError}
                    </div>
                  )}
                  <textarea
                    ref={replyRef}
                    className={`draft-editor ${draftState === 'streaming' ? 'generating' : ''}`}
                    readOnly={draftState === 'streaming'}
                    value={draftOutdated ? '' : draft}
                    onChange={(event) => {
                      if (draftState === 'streaming') return;
                      setDraft(event.target.value);
                      setDraftInputKey(replyInputKey(replyIntent, facts));
                      setPartialEdited(true);
                      const flags = lintDraft(
                        event.target.value,
                        facts
                          .split('\n')
                          .map((f) => f.trim())
                          .filter(Boolean),
                      );
                      setDraftError(flags.join(' ') || null);
                      setDraftState(flags.length ? 'blocked' : 'editable');
                    }}
                    placeholder={
                      draftOutdated
                        ? 'Generate from your current notes, or write your reply here…'
                        : 'Your draft will appear here…'
                    }
                    aria-label="Reply draft"
                  />
                  {draftOutdated && (
                    <details className="previous-draft">
                      <summary>View previous draft</summary>
                      <p>{draft}</p>
                    </details>
                  )}
                  {draftState === 'streaming' && (
                    <button className="text-button" onClick={cancelReply}>
                      Cancel generation
                    </button>
                  )}
                  {replyIntent === 'answer' && mode === 'recorded' && (
                    <p className="draft-note">
                      Live AI is unavailable. Your notes will not be replaced with a default reply.
                      <button className="text-button" onClick={() => void reconnectLiveAI()}>
                        Reconnect live AI
                      </button>
                    </p>
                  )}
                  {draftState === 'cancelled' && (
                    <div className="draft-note">
                      <TriangleAlert size={13} /> Incomplete draft · edit before reviewing
                    </div>
                  )}
                  <div className="reply-footer">
                    <span>
                      {draftState === 'streaming' ? (
                        <>
                          <LoaderCircle size={14} className="spin" /> Generating…
                        </>
                      ) : draftState === 'reviewed' ? (
                        <>
                          <Check size={14} /> Reviewed · press Mod+Enter to copy
                        </>
                      ) : needsDraftGeneration ? (
                        replyIntent === 'answer' ? (
                          'Your notes guide the next reply'
                        ) : (
                          'Ready to generate'
                        )
                      ) : (
                        'Review before copying'
                      )}
                    </span>
                    <div>
                      {!needsDraftGeneration && (
                        <button
                          className="quiet-button"
                          onClick={() => void startReply(replyIntent)}
                          disabled={draftState === 'streaming'}
                        >
                          <RefreshCcw size={14} /> {draft ? 'Regenerate' : 'Generate draft'}
                        </button>
                      )}
                      <button
                        className="primary-button"
                        onClick={() =>
                          needsDraftGeneration
                            ? void startReply(replyIntent)
                            : void markReviewedOrCopy()
                        }
                        disabled={
                          needsDraftGeneration
                            ? draftState === 'streaming' ||
                              (replyIntent === 'answer' && !facts.trim())
                            : !draft.trim() ||
                              draftState === 'streaming' ||
                              draftState === 'blocked' ||
                              (!draftComplete && !partialEdited)
                        }
                      >
                        {needsDraftGeneration ? (
                          <>
                            <RefreshCcw size={14} />
                            {replyIntent === 'answer' ? 'Generate from notes' : 'Generate draft'}
                          </>
                        ) : draftState === 'reviewed' ? (
                          <>
                            <Copy size={14} /> Copy reply
                          </>
                        ) : (
                          <>
                            <Check size={14} /> Review draft
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-reader">Select a mail to begin.</div>
          )}
        </section>
        <aside className="brief-sidebar" aria-label="Action brief">
          <div className="brief-top">
            <div>
              <h2>Next Step</h2>
            </div>
          </div>
          {extraction && thread && (
            <div className="brief-content">
              {followUps[thread.id] &&
                workspaceStorage.getItem(`threadline.followup-version.${thread.id}`) !==
                  JSON.stringify(thread.version) && (
                  <div className="warning-row reminder-review">
                    <TriangleAlert size={16} />
                    <span>
                      This mail changed. Review the saved follow-up.
                      <button className="text-button" onClick={removeFollowUp}>
                        Remove outdated follow-up
                      </button>
                    </span>
                  </div>
                )}
              {analysisState === 'running' && (
                <div className="fetch-progress" role="status">
                  <LoaderCircle size={16} className="spin" />
                  <span>Reading this mail and finding its next steps…</span>
                </div>
              )}
              {analysisState === 'failed' && analysisError && (
                <div className="fetch-error" role="alert">
                  <TriangleAlert size={16} />
                  <div>
                    <p>{analysisError}</p>
                    <button className="text-button" onClick={() => void analyzeSelected(mode)}>
                      Try again
                    </button>
                  </div>
                </div>
              )}
              {extraction.coverage.mode === 'partial' && (
                <div className="coverage-note">
                  Overview covers {extraction.coverage.included.length} of {thread.messages.length}{' '}
                  messages.
                </div>
              )}
              <div className="summary-block">
                {extraction.summary.map((item) => (
                  <div className="summary-item" key={`${item.text}-${item.evidenceIds.join('-')}`}>
                    <p>{item.text}</p>
                    {item.evidenceIds.map((id) => (
                      <EvidenceLink key={id} id={id} onClick={() => focusEvidence(id)} />
                    ))}
                  </div>
                ))}
              </div>
              <div className={`response-state response-${extraction.response.state}`}>
                <Mail size={14} />
                <span>
                  <strong>
                    {extraction.response.state === 'yes'
                      ? 'Response needed'
                      : extraction.response.state === 'no'
                        ? 'No response needed'
                        : 'Response state unclear'}
                  </strong>
                  <small>{extraction.response.reason}</small>
                </span>
              </div>
              <OrderedSections>
                <BriefSection
                  title="Your next actions"
                  icon={<Zap size={14} />}
                  active={briefSection === 'actions'}
                  onClick={() =>
                    setBriefSection((current) => (current === 'actions' ? 'none' : 'actions'))
                  }
                  count={extraction.actions.length}
                >
                  {extraction.actions.length ? (
                    extraction.actions.map((action) => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        completed={
                          completedItems.includes(action.id) || action.state === 'completed'
                        }
                        dismissed={dismissedItems.includes(action.id)}
                        onDismiss={() => dismissAction(action.id)}
                        onComplete={() => completeAction(action.id)}
                        onEvidence={() => focusEvidence(action.evidenceIds[0])}
                      />
                    ))
                  ) : (
                    <EmptyState
                      text={
                        extraction.response.state === 'no'
                          ? 'No action found in this mail.'
                          : 'No actions available.'
                      }
                    />
                  )}
                </BriefSection>
                <BriefSection
                  title="Waiting on others"
                  icon={<TimerReset size={14} />}
                  active={briefSection === 'summary'}
                  onClick={() =>
                    setBriefSection((current) => (current === 'summary' ? 'none' : 'summary'))
                  }
                  count={extraction.followUp.state === 'recommended' ? 1 : 0}
                >
                  {extraction.followUp.state === 'recommended' ? (
                    <div className="waiting-card">
                      <div className="waiting-icon">
                        <Clock3 size={15} />
                      </div>
                      <div>
                        <strong>
                          {ownerLabel(thread.participants, extraction.followUp.waitingOn)}
                        </strong>
                        <p>{extraction.followUp.reason}</p>
                        {followUps[thread.id] && (
                          <div className="reminder-controls">
                            <small>
                              Saved for {formatDate(followUps[thread.id])} · 9 AM New York
                            </small>
                            <button className="text-button" onClick={removeFollowUp}>
                              Remove follow-up
                            </button>
                          </div>
                        )}
                        {followUpPreview ? (
                          <div className="follow-up-preview">
                            <label>
                              Follow-up date{' '}
                              <input
                                type="date"
                                aria-label="Follow-up date"
                                value={followUpPreview.slice(0, 10)}
                                onChange={(event) => {
                                  if (event.target.value) {
                                    try {
                                      setFollowUpPreview(reminderAtNine(event.target.value));
                                    } catch (error) {
                                      setToast((error as Error).message);
                                    }
                                  }
                                }}
                              />
                            </label>
                            <small>{formatDate(followUpPreview)} at 9:00 AM New York</small>
                            <button className="primary-button" onClick={confirmFollowUp}>
                              Confirm follow-up
                            </button>
                            <button
                              className="text-button"
                              onClick={() => setFollowUpPreview(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button className="text-button" onClick={saveFollowUp}>
                            Preview follow-up <span>F</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      text={
                        extraction.followUp.state === 'not_needed'
                          ? 'Nothing is waiting on another person.'
                          : 'Waiting state is unclear.'
                      }
                    />
                  )}
                </BriefSection>
                <BriefSection
                  title="Open questions"
                  icon={<MessageCircleQuestion size={14} />}
                  active={briefSection === 'questions'}
                  onClick={() =>
                    setBriefSection((current) => (current === 'questions' ? 'none' : 'questions'))
                  }
                  count={extraction.questions.length}
                >
                  {extraction.questions.length ? (
                    extraction.questions.map((question) => (
                      <div className="question-card" key={question.id}>
                        <span className="question-mark">?</span>
                        <div>
                          <strong>{question.text}</strong>
                          <small>
                            {ownerLabel(thread.participants, question.addressedTo)} ·{' '}
                            {question.state} ·{' '}
                            <EvidenceLink
                              id={question.evidenceIds[0]}
                              onClick={() => focusEvidence(question.evidenceIds[0])}
                            />
                          </small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState text="No open questions found." />
                  )}
                </BriefSection>
                <BriefSection
                  title="Commitments & decisions"
                  icon={<Check size={14} />}
                  active={briefSection === 'decisions'}
                  onClick={() =>
                    setBriefSection((current) => (current === 'decisions' ? 'none' : 'decisions'))
                  }
                  count={extraction.commitments.length + extraction.decisions.length}
                >
                  {extraction.commitments.map((commitment) => (
                    <div className="date-card" key={commitment.id}>
                      <div>
                        <strong>{commitment.text}</strong>
                        <small>
                          {ownerLabel(thread.participants, commitment.owner)} · {commitment.state}
                        </small>
                      </div>
                      <EvidenceLink
                        id={commitment.evidenceIds[0]}
                        onClick={() => focusEvidence(commitment.evidenceIds[0])}
                      />
                    </div>
                  ))}
                  {extraction.decisions.map((decision) => (
                    <div className="date-card" key={decision.id}>
                      <div>
                        <strong>{decision.text}</strong>
                        <small>Decision · {decision.state}</small>
                      </div>
                      <EvidenceLink
                        id={decision.evidenceIds[0]}
                        onClick={() => focusEvidence(decision.evidenceIds[0])}
                      />
                    </div>
                  ))}
                  {!extraction.commitments.length && !extraction.decisions.length && (
                    <EmptyState text="No commitments or decisions found." />
                  )}
                </BriefSection>
                <BriefSection
                  title="Dates & uncertainty"
                  icon={<Clock3 size={14} />}
                  active={briefSection === 'dates'}
                  onClick={() =>
                    setBriefSection((current) => (current === 'dates' ? 'none' : 'dates'))
                  }
                  count={extraction.deadlines.length}
                >
                  {extraction.deadlines.map((deadline) => (
                    <div className="date-card" key={deadline.id}>
                      <div>
                        <strong>{deadline.phrase}</strong>
                        <small>
                          {deadline.precision === 'unresolved'
                            ? 'Needs confirmation'
                            : deadline.localDate
                              ? `Resolves to ${formatDate(deadline.localDate)}`
                              : deadline.instantUtc
                                ? formatTimestamp(deadline.instantUtc)
                                : 'Date unresolved'}{' '}
                        </small>
                        {deadlineOverdue(
                          deadline,
                          scenarioNow,
                          thread.messages.find(
                            (message) =>
                              message.id ===
                              evidence.find((span) => span.id === deadline.evidenceIds[0])
                                ?.messageId,
                          )?.timezone ?? null,
                        ) === true && <small className="overdue-label">Overdue</small>}
                        {deadline.precision === 'unresolved' &&
                          deadline.candidateDates.length > 0 && (
                            <small>
                              Possible dates:{' '}
                              {deadline.candidateDates.map((date) => formatDate(date)).join(' or ')}
                            </small>
                          )}
                      </div>
                      <span
                        className={
                          deadline.precision === 'unresolved' ? 'warning-chip' : 'neutral-chip'
                        }
                      >
                        {deadline.precision === 'unresolved' ? 'Unclear' : 'Source date'}
                      </span>
                      <EvidenceLink
                        id={deadline.evidenceIds[0]}
                        onClick={() => focusEvidence(deadline.evidenceIds[0])}
                      />
                    </div>
                  ))}
                  {extraction.warnings.map((warning) => (
                    <div className="warning-row" key={warning}>
                      <TriangleAlert size={14} />
                      {warning}
                    </div>
                  ))}
                </BriefSection>
              </OrderedSections>
              {extraction.response.state !== 'no' && (
                <button
                  className="draft-cta"
                  aria-label="Draft reply"
                  disabled={loading || !recipientFor(thread).length}
                  onClick={openReply}
                >
                  <span>
                    <Sparkles size={16} />
                    <span>
                      <strong>Draft reply</strong>
                      <small>Acknowledge, add your facts, or ask a question</small>
                    </span>
                  </span>
                  <span className="keycap">R</span>
                </button>
              )}
              {extraction.response.state === 'no' && (
                <button className="draft-cta done-cta" onClick={markDoneForNow}>
                  <span>
                    <Check size={16} />
                    <span>
                      <strong>
                        {doneForNow[`${thread.id}.${thread.version}`]
                          ? 'Done for now · reopen'
                          : 'Mark done for now'}
                      </strong>
                      <small>
                        {extraction.followUp.state === 'recommended'
                          ? 'Waiting on a reply. Save a local follow-up above.'
                          : 'No response is needed.'}
                      </small>
                    </span>
                  </span>
                  <span className="keycap">E</span>
                </button>
              )}
            </div>
          )}
        </aside>
      </main>
      {newMailOpen && (
        <MailComposer
          onClose={() => setNewMailOpen(false)}
          onAdd={addMail}
          liveEnabled={Boolean(bootstrap?.liveEnabled)}
        />
      )}
      {paletteOpen && (
        <div className="modal-backdrop" onMouseDown={() => setPaletteOpen(false)}>
          <div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-labelledby="palette-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span id="palette-title" className="sr-only">
              Command palette
            </span>
            <div className="palette-input">
              <Search size={17} />
              <input
                ref={paletteInputRef}
                value={paletteQuery}
                onChange={(event) => {
                  setPaletteQuery(event.target.value);
                  setPaletteIndex(0);
                }}
                aria-label="Find a command"
                placeholder="Find an action…"
              />
            </div>
            <div className="palette-results">
              {filteredCommands.map((command, index) => (
                <button
                  key={command.id}
                  className={index === paletteIndex ? 'highlighted' : ''}
                  onClick={() => {
                    command.action();
                    setPaletteOpen(false);
                    setPaletteQuery('');
                  }}
                >
                  <span>{command.label}</span>
                  <span className="keycap">{command.shortcut}</span>
                </button>
              ))}
              {!filteredCommands.length && <div className="palette-empty">No matching actions</div>}
            </div>
            <div className="palette-foot">
              <span>
                <ArrowUp size={12} />
                <ArrowDown size={12} /> navigate
              </span>
              <span>↵ run</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
      {showPerformance && (
        <div className="modal-backdrop" onMouseDown={() => setShowPerformance(false)}>
          <div
            className="performance-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="performance-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Performance</span>
                <h2 id="performance-title">Speed you can inspect</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close performance"
                onClick={() => setShowPerformance(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="metric-callout">
              <Zap size={18} />
              <div>
                <strong>
                  {mode === 'recorded'
                    ? 'Recorded playback timings are measured locally.'
                    : 'Live provider timings are measured separately.'}
                </strong>
                <p>These are this session’s observations, not universal product claims.</p>
              </div>
            </div>
            {performanceEvents.length ? (
              performanceEvents
                .slice()
                .reverse()
                .map((item, index) => (
                  <div className="metric-row" key={`${String(item.id)}-${index}`}>
                    <span>{String(item.operation)}</span>
                    <strong>{Math.round(Number(item.durationMs))} ms</strong>
                    <small>{String(item.source)}</small>
                  </div>
                ))
            ) : (
              <div className="empty-state large">
                <Info size={17} />
                <span>No measurements yet. Complete a workflow to see timings.</span>
              </div>
            )}
            <div className="drawer-note">
              <Info size={14} /> Provider timings and controlled benchmarks are separate from this
              local session panel.
            </div>
          </div>
        </div>
      )}
      {showGuide && !guideDismissed && (
        <div className="modal-backdrop" onMouseDown={closeGuide}>
          <div
            className="demo-guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-head">
              <div>
                <span className="eyebrow">A three-minute walkthrough</span>
                <h2 id="guide-title">From email to a clear next action</h2>
              </div>
              <button className="icon-button" aria-label="Close demo guide" onClick={closeGuide}>
                <X size={18} />
              </button>
            </div>
            <p>
              Read the brief, verify its source, then act. Threadline keeps the original email
              visible so you can inspect each claim before relying on it.
            </p>
            <div className="guide-scenarios">
              {[
                {
                  id: 'recruiter-coordination',
                  title: '1. Draft without guessing',
                  text: 'Check the interview request. Draft an acknowledgment, edit it, review it, then copy.',
                },
                {
                  id: 'waiting-on-reply',
                  title: '2. Close the waiting loop',
                  text: 'Save a follow-up, advance the scenario clock, then simulate a reply. Inspect how the next action changes.',
                },
                {
                  id: 'prompt-injection',
                  title: '3. Inspect the trust boundary',
                  text: 'Compare the request with its source. Suspicious instructions remain visible as email text.',
                },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    closeGuide();
                    void loadThread(item.id);
                  }}
                >
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
            <button
              className="guide-custom-mail"
              onClick={() => {
                closeGuide();
                setNewMailOpen(true);
              }}
            >
              <MailPlus size={18} />
              <span>
                <strong>4. Try a mail of your own</strong>
                <span>Paste a message, fetch its overview, and draft a reply from your facts.</span>
              </span>
              <ChevronRight size={16} />
            </button>
            <h3>Keyboard shortcuts</h3>
            <dl className="shortcut-grid">
              {[
                ['Ctrl/Cmd + K', 'Command palette'],
                ['J / K', 'Next / previous filtered mail'],
                ['/', 'Search mails'],
                ['R', 'Open or draft a reply'],
                ['Shift + R', 'Focus facts for an answer'],
                ['C', 'Draft a clarification'],
                ['Ctrl/Cmd + Enter', 'Generate facts, review, or copy'],
                ['F', 'Preview a follow-up'],
                ['A / Q', 'Actions / questions'],
                ['V', 'Inspect a source'],
                ['L', 'Refresh analysis'],
                ['E', 'Done for now / reopen'],
                ['U', 'Undo a local change'],
                ['P', 'Session timings'],
                ['Escape', 'Close dialog or cancel draft'],
                ['?', 'This guide'],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="guide-note">
              Keep the mail in view, inspect a source when needed, then review and copy your reply.
              Nothing is sent automatically.
            </p>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

function MessageCard({
  message,
  participants,
  expanded,
  focused,
  highlightSpan,
  onReply,
  onToggle,
}: {
  message: Message;
  participants: Participant[];
  expanded: boolean;
  focused: boolean;
  highlightSpan: { start: number; end: number } | null;
  onReply: () => void;
  onToggle: () => void;
}) {
  return (
    <article
      className={`message-card ${expanded ? 'expanded' : ''} ${focused ? 'focused' : ''}`}
      id={message.id}
    >
      <button
        className="message-meta message-meta-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`body-${message.id}`}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} message from ${senderName(
          participants,
          message.senderId,
        )}`}
      >
        <Avatar name={senderName(participants, message.senderId)} className="message-avatar" />
        <div>
          <strong>{senderName(participants, message.senderId)}</strong>
          <span>
            {message.senderId === viewer.id
              ? 'You'
              : participants.find((person) => person.id === message.senderId)?.email}
          </span>
        </div>
        <time
          dateTime={message.sentAt ?? undefined}
          title={`${message.sentAt ?? 'Unknown date'} · ${message.timezone ?? 'Unknown source timezone'}`}
        >
          {message.sentAt ? formatTimestamp(message.sentAt) : 'Date unknown'}
        </time>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      <div
        hidden={!expanded}
        className="message-body"
        id={`body-${message.id}`}
        tabIndex={focused ? -1 : undefined}
      >
        {highlightSpan ? highlightMessage(message.body, highlightSpan) : message.body}
      </div>
      {!expanded && (
        <button
          className="message-preview"
          onClick={onToggle}
          aria-expanded="false"
          aria-controls={`body-${message.id}`}
          aria-label={`Read full mail from ${senderName(participants, message.senderId)}`}
        >
          <span>
            {message.body.replace(/\s+/g, ' ').slice(0, 220)}
            {message.body.length > 220 ? '…' : ''}
          </span>
          <span className="message-expand-label">
            Read full mail <ChevronRight size={13} />
          </span>
        </button>
      )}
      {expanded && (
        <div className="message-tools">
          <button className="text-button" onClick={onReply}>
            <ReplyIcon /> Reply
          </button>
        </div>
      )}
    </article>
  );
}

function ReplyIcon() {
  return <Send size={13} />;
}
function highlightMessage(body: string, span: { start: number; end: number }) {
  const { start, end } = span;
  if (start < 0 || end > body.length) return body;
  return (
    <>
      {body.slice(0, start)}
      <mark className="source-highlight">{body.slice(start, end)}</mark>
      {body.slice(end)}
    </>
  );
}
function EvidenceLink({ id, onClick }: { id: string; onClick: () => void }) {
  return (
    <button className="evidence-link" onClick={onClick} aria-label={`View source ${id}`}>
      <span>Source</span> <ExternalLink size={11} />
    </button>
  );
}
function ActionCard({
  action,
  completed,
  dismissed,
  onDismiss,
  onComplete,
  onEvidence,
}: {
  action: Extraction['actions'][number];
  completed: boolean;
  dismissed: boolean;
  onDismiss: () => void;
  onComplete: () => void;
  onEvidence: () => void;
}) {
  return (
    <div className={`action-card ${completed ? 'completed' : ''} ${dismissed ? 'dismissed' : ''}`}>
      <button
        className="check-button"
        onClick={onComplete}
        disabled={action.state === 'completed'}
        aria-label={
          action.state === 'completed'
            ? 'Completed in the source mail'
            : completed
              ? 'Reopen action'
              : 'Complete action'
        }
      >
        {completed ? <Check size={13} /> : null}
      </button>
      <div className="action-copy">
        <strong>{action.title}</strong>
        {dismissed && <small>Dismissed locally</small>}
        <small>
          {action.owner.label ?? 'Unknown owner'}{' '}
          {action.state !== 'open' && <span>· {action.state} </span>}
          {action.basis === 'inferred' && <span className="inferred-chip">Inferred</span>}
        </small>
        <button className="text-button" onClick={onDismiss}>
          {dismissed ? 'Restore action' : 'Dismiss'}
        </button>
        <button className="text-button source-button" onClick={onEvidence}>
          View evidence <span>V</span>
        </button>
      </div>
    </div>
  );
}
function BriefSection({
  title,
  icon,
  count,
  active,
  onClick,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`brief-section ${active && count > 0 ? 'active' : ''} ${count === 0 ? 'empty-section' : ''}`}
    >
      <button
        className="section-toggle"
        onClick={onClick}
        disabled={count === 0}
        aria-expanded={active && count > 0}
      >
        <span>
          {icon}
          <strong>{title}</strong>
        </span>
        <span className="section-meta">
          {count > 0 && <span className="section-count">{count}</span>}
          {active && count > 0 ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {active && count > 0 && <div className="section-body">{children}</div>}
    </section>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Info size={14} />
      {text}
    </div>
  );
}
export default App;
function OrderedSections({ children }: { children: ReactNode }) {
  const sections = Children.toArray(children).filter((child) =>
    isValidElement<{ count: number }>(child),
  );
  sections.sort((left, right) => Number(right.props.count > 0) - Number(left.props.count > 0));
  return <div className="ordered-sections">{sections}</div>;
}
