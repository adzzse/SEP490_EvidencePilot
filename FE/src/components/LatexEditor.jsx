import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import DiffMatchPatch from 'diff-match-patch';
import { basicSetup } from 'codemirror';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { latex } from 'codemirror-lang-latex';

const lightTheme = EditorView.theme({
  '&': { backgroundColor: '#ffffff' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", "Fira Code", monospace' },
});

const setReviewRanges = StateEffect.define();
const reviewRanges = StateField.define({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setReviewRanges)) {
        next = Decoration.set(effect.value.map(({ from, to }) =>
          Decoration.mark({ class: 'cm-review-finding' }).range(from, to)), true);
      }
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field),
});

const LatexEditor = forwardRef(function LatexEditor({ content, onChange, readOnly = false, fontSize = 14, findings = [], onFindingClick, onScroll }, ref) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const lastEmittedRef = useRef('');
  const onScrollRef = useRef(null);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  onScrollRef.current = onScroll;

  useImperativeHandle(ref, () => ({
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
    undo: () => {
      const v = viewRef.current;
      if (!v) return;
      v.undo();
    },
    redo: () => {
      const v = viewRef.current;
      if (!v) return;
      v.redo();
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
        .map(({ from, to }) => ({
          from: Math.max(0, Math.min(from, v.state.doc.length)),
          to: Math.max(0, Math.min(to, v.state.doc.length)),
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
    // --- Anchor sync primitives (Overleaf-style source↔preview mapping) ---
    getTopVisibleOffset: () => {
      const v = viewRef.current;
      if (!v) return 0;
      try {
        const block = v.lineBlockAtHeight(v.scrollDOM.scrollTop + 1);
        return Math.max(0, Math.min(block.from, v.state.doc.length));
      } catch {
        return 0;
      }
    },
    scrollToOffset: (offset) => {
      const v = viewRef.current;
      if (!v) return;
      const at = Math.max(0, Math.min(offset, v.state.doc.length));
      const dom = v.domAtPos(at);
      const node = dom.node.nodeType === 1 ? dom.node : dom.node.parentElement;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const scrollerRect = v.scrollDOM.getBoundingClientRect();
      v.scrollDOM.scrollTop += rect.top - scrollerRect.top;
    },
    scrollToTop: () => {
      const v = viewRef.current;
      if (v) v.scrollDOM.scrollTop = 0;
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
    if (viewRef.current) viewRef.current.destroy();

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChange) {
        const text = update.state.doc.toString();
        if (text === lastEmittedRef.current) return;
        lastEmittedRef.current = text;
        onChange(text);
      }
    });

    const state = EditorState.create({
      doc: content || '',
      extensions: [
        basicSetup,
        latex(),
        isDark ? oneDark : lightTheme,
        EditorView.editable.of(!readOnly),
        EditorView.lineWrapping,
        reviewRanges,
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
          '.cm-gutters': { display: 'none' },
        }),
      ],
    });

    viewRef.current = new EditorView({ state, parent: containerRef.current });

    // Scroll listener lives with the view so readOnly/fontSize/theme rebuilds re-bind it.
    const handleScroll = () => { onScrollRef.current?.(); };
    viewRef.current.scrollDOM.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (viewRef.current) {
        viewRef.current.scrollDOM.removeEventListener('scroll', handleScroll);
        viewRef.current.destroy();
      }
    };
  }, [readOnly, fontSize, isDark]);

  // Hydration effect — same-section external store updates (e.g. AI "Insert
  // Citation") are pushed into the doc as a MINIMAL diff so the cursor and
  // undo history survive. Section switches never hit this path: the key remount
  // builds a fresh view whose initial doc already equals `content`.
  useEffect(() => {
    const v = viewRef.current;
    if (!v || content === undefined) return;
    const current = v.state.doc.toString();
    if (current === content) {
      lastEmittedRef.current = content || '';
      return;
    }
    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(current, content);
    dmp.diff_cleanupSemantic(diffs);
    const changes = [];
    let pos = 0;
    for (const [op, text] of diffs) {
      const len = text.length;
      if (op === 0) pos += len;
      else if (op === -1) changes.push({ from: pos, to: pos + len });
      else changes.push({ from: pos, insert: text });
    }
    if (changes.length) {
      lastEmittedRef.current = content || ''; // stamp before dispatch → updateListener echo is a no-op
      v.dispatch({ changes });
    } else {
      lastEmittedRef.current = content || '';
    }
  }, [content]);

  // Update review ranges when findings change
  useEffect(() => {
    if (viewRef.current && findings) {
      const ranges = findings.map(f => ({ from: f.from, to: f.to }));
      viewRef.current.dispatch({ effects: setReviewRanges.of(ranges) });
    }
  }, [findings]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
});

export default LatexEditor;