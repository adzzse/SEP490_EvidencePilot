import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import VisualSourceMap from '../src/components/features/VisualSourceMap.jsx';
import { ThemeProvider } from '../src/context/ThemeContext.jsx';
import '../src/i18n.js';
import '../src/index.css';

function Fixture() {
  const [project, setProject] = useState(null);
  const [draft, setDraft] = useState('Unsaved draft');
  // Test-only switch also exercises an in-flight project change while the native dialog is open.
  window.switchSourceMapProject = setProject;
  return <ThemeProvider><textarea aria-label="Draft" value={draft} onChange={e => setDraft(e.target.value)} />
    <button onClick={() => setProject('one')}>Open map</button>
    {project && <VisualSourceMap key={project} projectId={project} onClose={() => setProject(null)} />}
  </ThemeProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
