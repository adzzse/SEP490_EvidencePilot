import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
// ponytail: diff-match-patch removed — single replace dispatch covers hydration; CM maps decorations.
import { basicSetup } from 'codemirror';
import { Annotation, EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, ViewPlugin } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { latex } from 'codemirror-lang-latex';
import { undo, redo } from '@codemirror/commands';
import { changeSpans, createChangeTracker, normalizeSource, remapAnchor, resolveAnchor, sourceFingerprint } from '../../utils/student/feedbackAnchors.js';

const lightTheme = EditorView.theme({
  '&': { backgroundColor: '#ffffff' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", "Fira Code", monospace' },
});

// Bridge so CM decorations can reach React without rebuilding the view.
let reviewClickBridge = null;

const TONE_COLORS = { discrepancy: '#ef4444', warn: '#f59e0b', neutral: '#94a3b8' };

const setReviewRanges = StateEffect.define();
const setFeedbackItems = StateEffect.define();
const setFeedbackActive = StateEffect.define();
const hydrateSource = Annotation.define();
const feedbackRanges = StateField.define({
  create: () => ({ items: [], activeId: null, visible: false, decorations: Decoration.none }),
  update(value, transaction) {
    let items = value.items;
    let activeId = value.activeId;
    let visible = value.visible;
    if (transaction.docChanged) {
      const spans = changeSpans(transaction.changes);
      const text = transaction.newDoc.toString();
      items = items.map(item => ({ ...item, anchor: remapAnchor(item.anchor, text, spans) }));
    }
    for (const effect of transaction.effects) {
      if (effect.is(setFeedbackItems)) items = effect.value;
      if (effect.is(setFeedbackActive)) ({ activeId, visible } = effect.value);
    }
    if (items === value.items && activeId === value.activeId && visible === value.visible) return value;
    const decorations = visible ? Decoration.set(items.flatMap(item => {
      const { from, to } = item.anchor.current;
      if (from == null || to == null || from < 0 || to <= from || to > transaction.newDoc.length) return [];
      return [Decoration.mark({ class: `cm-feedback-range${item.id === activeId ? ' cm-feedback-active' : ''}`,
        attributes: { 'data-feedback-id': String(item.id) } }).range(from, to)];
    }), true) : Decoration.none;
    return { items, activeId, visible, decorations };
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});
const reviewRanges = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    // Map existing decorations through the transaction FIRST so citation
    // insertions keep every finding (mark + icon) glued to its text.
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setReviewRanges)) {
        next = Decoration.set(effect.value.flatMap(({ from, to, findingIndex, className, tone }) => [
          Decoration.mark({ class: className || 'cm-review-finding' }).range(from, to),
          Decoration.widget({
            widget: new InfoIconWidget(findingIndex, to, tone),
          }, { side: 1 }).range(to),
        ]), true);
      }
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

class InfoIconWidget extends WidgetType {
  constructor(findingIndex, pos, tone) {
    super();
    this.findingIndex = findingIndex;
    this.pos = pos;
    this.tone = tone || 'warn';
  }

  toDOM(view) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-finding-widget';
    btn.style.background = TONE_COLORS[this.tone] || TONE_COLORS.warn;
    btn.setAttribute('aria-label', 'Show citation review');
    btn.title = 'Show citation review';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't move the CM selection
      reviewClickBridge?.(this.findingIndex, view.coordsAtPos(this.pos));
    };
    return btn;
  }

  eq(other) {
    return other.findingIndex === this.findingIndex
      && other.pos === this.pos && other.tone === this.tone;
  }
  ignoreEvent() { return true; } // CM must not swallow the DOM click
}

// --- Citation pill masking: \cite{id} renders as (Author, Year); cursor
// proximity (±1 char) dissolves the mask to reveal the raw LaTeX. ---

function firstAuthorSurname(authors) {
  if (!authors) return '';
  const first = String(authors).split(/[;,]/)[0].trim();
  if (!first) return '';
  const words = first.split(/\s+/);
  return words.length > 1 ? words[words.length - 1] : first;
}

class CitePillWidget extends WidgetType {
  constructor(key, meta) {
    super();
    this.key = key;
    this.meta = meta;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = `cm-cite-pill${this.meta ? '' : ' cm-cite-pill--unresolved'}`;
    const surname = firstAuthorSurname(this.meta?.authors);
    const year = this.meta?.publicationYear || null;
    span.textContent = surname || year
      ? `(${surname || this.key}${year ? `, ${year}` : ''})`
      : this.key;
    span.title = `\\cite{${this.key}}`;
    span.contentEditable = 'false';
    return span;
  }

  eq(other) { return other.key === this.key && other.meta === this.meta; }
  ignoreEvent() { return false; } // clicks place the cursor at the edge → reveal raw text
}

const CITE_RE = /\\cite\{([^}]+)\}/g;

function buildCiteMask(view, citationIndexRef) {
  const decorations = [];
  const head = view.state.selection.main.head;
  const doc = view.state.doc.toString();
  CITE_RE.lastIndex = 0;
  let match;
  while ((match = CITE_RE.exec(doc))) {
    const from = match.index;
    const to = from + match[0].length;
    // Reveal rule: dissolve when the cursor sits inside or immediately adjacent.
    if (head >= from - 1 && head <= to + 1) continue;
    decorations.push(Decoration.replace({
      widget: new CitePillWidget(match[1], citationIndexRef.current?.[match[1]]),
    }).range(from, to));
  }
  return Decoration.set(decorations, true);
}

const LatexEditor = forwardRef(function LatexEditor({ content, savedContent = content, savedVersion,
  feedbackItems, activeFeedbackId, feedbackVisible = false, onFeedbackClick, onFeedbackChange,
  onChange, readOnly = false, fontSize = 14, findings = [], onFindingClick, onScroll, onLayoutChange, onUserScroll, citationIndex = {} }, ref) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const trackerRef = useRef(null);
  if (!trackerRef.current) trackerRef.current = createChangeTracker(savedContent, content);
  const onChangeRef = useRef(onChange);
  const feedbackClickRef = useRef(onFeedbackClick);
  const feedbackChangeRef = useRef(onFeedbackChange);
  onChangeRef.current = onChange;
  feedbackClickRef.current = onFeedbackClick;
  feedbackChangeRef.current = onFeedbackChange;
  const lastEmittedRef = useRef('');
  const onScrollRef = useRef(null);
  const onLayoutChangeRef = useRef(null);
  const onUserScrollRef = useRef(null);
  const citationIndexRef = useRef({});
  const citationIndexVersionRef = useRef(0);
  const prevCitationIndexRef = useRef(citationIndex);
  if (prevCitationIndexRef.current !== citationIndex) {
    prevCitationIndexRef.current = citationIndex;
    citationIndexVersionRef.current += 1;
  }
  citationIndexRef.current = citationIndex;
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  onScrollRef.current = onScroll;
  onLayoutChangeRef.current = onLayoutChange;
  onUserScrollRef.current = onUserScroll;
  reviewClickBridge = onFindingClick; // live bridge for CM widget clicks

  useImperativeHandle(ref, () => ({
    getChangeSnapshot: () => trackerRef.current.snapshot(),
    acknowledgeSave: snapshot => trackerRef.current.acknowledge(snapshot),
    getFeedbackPositions: () => {
      const v = viewRef.current;
      if (!v) return [];
      const viewport = v.scrollDOM.getBoundingClientRect();
      return v.state.field(feedbackRanges).items.map(item => {
        const { from, to } = item.anchor.current;
        const coords = from != null && from <= v.state.doc.length ? v.coordsAtPos(from, 1) : null;
        return { ...item, from, to, top: coords?.top ?? null, bottom: coords?.bottom ?? null,
          viewportTop: viewport.top, viewportBottom: viewport.bottom };
      });
    },
    getSelection: () => {
      const v = viewRef.current;
      if (!v) return '';
      return v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);
    },
    getSelectionRange: () => {
      const selection = viewRef.current?.state.selection.main;
      return selection ? { from: selection.from, to: selection.to } : null;
    },
    insertAtCursor: (text, cursorOffset) => {
      const v = viewRef.current;
      if (!v) return null;
      const from = v.state.selection.main.from;
      v.dispatch({
        changes: { from, to: v.state.selection.main.to, insert: text },
        selection: { anchor: cursorOffset != null ? from + cursorOffset : from + text.length },
      });
      return v.state.doc.toString();
    },
    insertAtOffset: (offset, text) => {
      const v = viewRef.current;
      if (!v) return null;
      const at = Math.max(0, Math.min(offset, v.state.doc.length));
      v.dispatch({
        changes: { from: at, insert: text },
        selection: { anchor: at + text.length },
        scrollIntoView: true,
      });
      return v.state.doc.toString();
    },
    selectRange: (from, to) => {
      const v = viewRef.current;
      if (!v) return;
      const start = Math.max(0, Math.min(from, v.state.doc.length));
      const end = Math.max(start, Math.min(to, v.state.doc.length));
      v.dispatch({
        selection: { anchor: start, head: end },
        effects: EditorView.scrollIntoView(start, { y: 'center' }),
      });
      v.focus();
    },
    revealRange: (from, to, onReady) => {
      const v = viewRef.current;
      if (!v) return false;
      const start = Math.max(0, Math.min(from, v.state.doc.length));
      const end = Math.max(start, Math.min(to, v.state.doc.length));
      v.dispatch({
        selection: { anchor: start, head: end },
        effects: EditorView.scrollIntoView(start, { y: 'center' }),
      });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (viewRef.current === v) onReady?.(v.coordsAtPos(end) || v.coordsAtPos(start));
      }));
      v.focus();
      return true;
    },
    undo: () => {
      const v = viewRef.current;
      if (!v) return;
      undo(v);
    },
    redo: () => {
      const v = viewRef.current;
      if (!v) return;
      redo(v);
    },
    replaceFirst: (query, replacement) => {
      const v = viewRef.current;
      if (!v || !query) return { changed: false, count: 0 };
      const doc = v.state.doc.toString();
      const cursor = v.state.selection.main.from;
      let from = doc.indexOf(query, cursor);
      if (from < 0) from = doc.indexOf(query);
      if (from < 0) return { changed: false, count: 0 };
      const to = from + query.length;
      v.dispatch({
        changes: { from, to, insert: replacement },
        selection: { anchor: from + replacement.length },
        scrollIntoView: true,
      });
      v.focus();
      return { changed: true, count: 1 };
    },
    replaceAll: (query, replacement) => {
      const v = viewRef.current;
      if (!v || !query) return { changed: false, count: 0 };
      const doc = v.state.doc.toString();
      const parts = doc.split(query);
      const count = parts.length - 1;
      if (count === 0) return { changed: false, count: 0 };
      const changes = [];
      let pos = 0;
      for (let i = 0; i < count; i++) {
        pos += parts[i].length;
        changes.push({ from: pos, to: pos + query.length, insert: replacement });
        pos += query.length;
      }
      v.dispatch({ changes, scrollIntoView: true });
      v.focus();
      return { changed: true, count };
    },
    setReviewRanges: (ranges = []) => {
      const v = viewRef.current;
      if (!v) return;
      const valid = ranges
        .map(({ from, to, ...rest }) => ({
          from: Math.max(0, Math.min(from, v.state.doc.length)),
          to: Math.max(0, Math.min(to, v.state.doc.length)),
          ...rest,
        }))
        .filter(({ from, to }) => to > from)
        .sort((left, right) => left.from - right.from);
      v.dispatch({ effects: setReviewRanges.of(valid) });
    },
    getScrollInfo: () => {
      const v = viewRef.current;
      if (!v) return { top: 0, height: 0, clientHeight: 0 };
      const scroller = v.scrollDOM;
      return {
        top: scroller.scrollTop,
        height: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      };
    },
    getSourceBounds: (from, to) => {
      const v = viewRef.current;
      if (!v) return { top: 0, bottom: 0 };
      const start = Math.max(0, Math.min(from, v.state.doc.length));
      const end = Math.max(start, Math.min(to - 1, v.state.doc.length));
      return {
        top: v.lineBlockAt(start).top + v.documentPadding.top,
        bottom: v.lineBlockAt(end).bottom + v.documentPadding.top,
      };
    },
    scrollToTop: () => {
      const v = viewRef.current;
      if (v) v.scrollDOM.scrollTop = 0;
    },
    scrollTo: (top) => {
      const v = viewRef.current;
      if (!v) return;
      v.scrollDOM.scrollTop = top;
    },
  }));

  useEffect(() => {
    const el = document.documentElement;
    const cb = () => setIsDark(el.classList.contains('dark'));
    const mo = new MutationObserver(cb);
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const previousState = viewRef.current?.state;
    const previousScroll = viewRef.current?.scrollDOM.scrollTop ?? 0;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.geometryChanged) onLayoutChangeRef.current?.();
      if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(hydrateSource))) {
        trackerRef.current.record(update.changes, update.state.doc.toString());
      }
      if (update.state.field(feedbackRanges) !== update.startState.field(feedbackRanges)) {
        feedbackChangeRef.current?.(update.state.field(feedbackRanges).items);
      }
      if (update.docChanged && onChangeRef.current) {
        const text = update.state.doc.toString();
        if (text === lastEmittedRef.current) return;
        lastEmittedRef.current = text;
        onChangeRef.current(text);
      }
    });

    const config = {
      doc: content || '',
      extensions: [
        basicSetup,
        latex(),
        isDark ? oneDark : lightTheme,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.lineWrapping,
        reviewRanges,
        feedbackRanges,
        EditorView.domEventHandlers({
          click(event, view) {
            if (!event.target.closest('[data-feedback-id]')) return false;
            const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
            const ids = view.state.field(feedbackRanges).items.filter(item => item.anchor.current.from != null
              && position >= item.anchor.current.from && position <= item.anchor.current.to).map(item => item.id);
            if (ids.length) feedbackClickRef.current?.(ids);
            return false;
          },
        }),
        // \cite{} pill masking with cursor-proximity reveal + atomic navigation
        ViewPlugin.fromClass(
          class CitationMasker {
            constructor(view) {
              this.version = citationIndexVersionRef.current;
              this.decorations = buildCiteMask(view, citationIndexRef);
            }
            update(update) {
              const indexChanged = this.version !== citationIndexVersionRef.current;
              if (!update.docChanged && !update.selectionSet && !indexChanged) return;
              this.version = citationIndexVersionRef.current;
              this.decorations = buildCiteMask(update.view, citationIndexRef);
            }
          },
          {
            decorations: plugin => plugin.decorations,
            provide: plugin => EditorView.atomicRanges.of(
              view => view.plugin(plugin)?.decorations ?? Decoration.none,
            ),
          },
        ),
        updateListener,
        EditorView.theme({
          '&': { fontSize: `${fontSize}px`, backgroundColor: isDark ? '#0f172a' : '#ffffff', color: isDark ? '#f8fafc' : '#000000', height: '100%' },
          '.cm-editor': { width: '100%', maxWidth: '100%', height: '100%', overflow: 'hidden' },
          '.cm-scroller': { fontFamily: '"JetBrains Mono", "Fira Code", monospace', width: '100%', height: '100%', overflow: 'auto' },
          '.cm-content': { color: isDark ? '#f8fafc' : '#000000', breakWords: 'break-word', overflowWrap: 'anywhere' },
          '.cm-line': { color: isDark ? '#f8fafc' : '#000000', wordBreak: 'break-word', overflowWrap: 'anywhere' },
          '.cm-content *, .cm-line *': { color: isDark ? '#f8fafc !important' : '#000000 !important' },
          '.cm-activeLine': { backgroundColor: isDark ? '#0f172a !important' : '#ffffff !important' },
          '.cm-activeLineGutter': { backgroundColor: isDark ? '#0f172a !important' : '#ffffff !important' },
          '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.35) !important' : 'rgba(224, 231, 255, 0.6) !important' },
          '.cm-lintRange': { wordBreak: 'break-word', overflowWrap: 'anywhere', maxWidth: '100%' },
          '.cm-lintRange-warning': { backgroundColor: 'transparent', borderBottom: '2px solid #eab308' },
          '.cm-lintRange-error': { backgroundColor: 'transparent', borderBottom: '2px solid #ef4444' },
          '.cm-review-finding': { backgroundColor: 'rgba(245, 158, 11, 0.18)', borderBottom: '2px solid #f59e0b' },
          '.cm-review-finding--discrepancy': { backgroundColor: 'rgba(239, 68, 68, 0.14)', borderBottomColor: '#ef4444' },
          '.cm-review-finding--unsupported': { backgroundColor: 'rgba(148, 163, 184, 0.16)', borderBottomColor: '#94a3b8' },
          '.cm-review-finding--high': { borderBottomStyle: 'solid' },
          '.cm-review-finding--medium': { borderBottomStyle: 'dashed' },
          '.cm-review-finding--low': { borderBottomStyle: 'dotted' },
          '.cm-feedback-range': { backgroundColor: 'rgba(20, 184, 166, 0.16)', boxShadow: 'inset 0 -2px #0d9488', cursor: 'pointer' },
          '.cm-feedback-active': { backgroundColor: 'rgba(20, 184, 166, 0.3)', outline: '1px solid #0d9488' },
          '.cm-finding-widget': {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            marginLeft: '3px',
            padding: '0',
            border: 'none',
            borderRadius: '50%',
            background: '#f59e0b',
            color: '#ffffff',
            cursor: 'pointer',
            verticalAlign: '-2px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          },
          '.cm-finding-widget:hover': { background: '#d97706' },
          '.cm-cite-pill': {
            display: 'inline-block',
            padding: '0 6px',
            margin: '0 1px',
            borderRadius: '9999px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            color: '#4f46e5',
            fontSize: '0.85em',
            fontWeight: '600',
            lineHeight: '1.5',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          },
          '.cm-cite-pill--unresolved': {
            background: 'rgba(148, 163, 184, 0.15)',
            borderColor: 'rgba(148, 163, 184, 0.4)',
            color: '#94a3b8',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '0.75em',
          },
          '.cm-gutters': { display: 'none' },
        }),
      ],
    };
    const state = previousState
      ? previousState.update({ effects: StateEffect.reconfigure.of(config.extensions) }).state
      : EditorState.create(config);

    viewRef.current = new EditorView({ state, parent: containerRef.current });
    viewRef.current.scrollDOM.scrollTop = previousScroll;
    onLayoutChangeRef.current?.();

    // Scroll listener lives with the view so readOnly/fontSize/theme rebuilds re-bind it.
    const handleScroll = () => {
      onScrollRef.current?.();
      onUserScrollRef.current?.(); // e.g. instantly close the inline citation card
    };
    viewRef.current.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (viewRef.current) {
        viewRef.current.scrollDOM.removeEventListener('scroll', handleScroll);
        viewRef.current.destroy();
      }
    };
  }, [readOnly, fontSize, isDark]);

  useEffect(() => {
    const saved = normalizeSource(savedContent);
    if (trackerRef.current.baseContent !== saved) {
      trackerRef.current = createChangeTracker(saved, content);
    }
  }, [savedContent]);

  // Hydration — replace whole doc; CM maps decorations/marks for us.
  useEffect(() => {
    const v = viewRef.current;
    if (!v || content === undefined) return;
    const current = v.state.doc.toString();
    const next = normalizeSource(content);
    if (current === next) {
      lastEmittedRef.current = next;
      return;
    }
    lastEmittedRef.current = next;
    v.dispatch({ changes: { from: 0, to: current.length, insert: next },
      annotations: trackerRef.current.content === next ? hydrateSource.of(true) : undefined });
  }, [content]);

  useEffect(() => {
    let cancelled = false;
    const base = normalizeSource(savedContent);
    sourceFingerprint(base).catch(() => null).then(hash => {
      if (cancelled || trackerRef.current.baseContent !== base || !viewRef.current) return;
      const snapshot = trackerRef.current.snapshot();
      const items = (feedbackItems || []).map(item => {
        let anchor = resolveAnchor(item.anchor ?? { original: null, current: { status: item.lineReference ? 'UNLOCATED' : 'SECTION' } }, base, savedVersion, hash);
        if (snapshot.changes.length) anchor = remapAnchor(anchor, snapshot.content, snapshot.changes);
        return { id: item.id, anchor };
      });
      viewRef.current.dispatch({ effects: setFeedbackItems.of(items) });
    });
    return () => { cancelled = true; };
  }, [feedbackItems, savedContent, savedVersion]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setFeedbackActive.of({ activeId: activeFeedbackId, visible: feedbackVisible }) });
  }, [activeFeedbackId, feedbackVisible]);

  // Update review ranges when findings change
  useEffect(() => {
    if (viewRef.current && findings) {
      const ranges = findings.map(({ from, to, ...rest }) => ({ from, to, ...rest }));
      viewRef.current.dispatch({ effects: setReviewRanges.of(ranges) });
    }
  }, [findings]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
});

export default LatexEditor;
