'use strict';

const $ = (selector, parent = document) => parent.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const iconPaths = {
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h3z"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
  chart: '<path d="M4 3v17h17M8 16v-5M13 16V7M18 16V4"/>',
  note: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/>',
  chat: '<path d="M21 11a9 9 0 0 1-9 9H5l-4 3 2-7A9 9 0 1 1 21 11z"/>',
  settings: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  send: '<path d="M12 20V4M5 11l7-7 7 7"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
};
function icon(name, extra = '') { return `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.book}</svg>`; }

let app = {route: 'classroom', lessons: [], levels: [], state: null, token: '', tutor: {}, messages: [], job: null, quizIndex: 0, feedback: null};
let noteTimer, draftTimer, notePending = null, draftPending = null, saveQueue = Promise.resolve(), navigationBusy = false;
const lesson = () => app.lessons.find(item => item.id === app.state.settings.lesson);
const work = () => app.state.work[lesson().id];
const maxStep = () => lesson().steps.length + 2;

async function api(path, data) {
  if (window.AcademyPages) return window.AcademyPages.api(path,data);
  const response = await fetch(path, data === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Academy-Token': app.token}, body: JSON.stringify(data)});
  let result;
  try { result = await response.json(); } catch { throw new Error('The classroom did not respond. Try opening it again.'); }
  if (!response.ok) throw new Error(result.error || 'Something could not be saved. Please try again.');
  return result;
}
function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('visible');
  clearTimeout(toast.timeout); toast.timeout = setTimeout(() => element.classList.remove('visible'), 4500);
}
function saved() { const element = $('#save-status'); if (element) element.textContent = app.qa ? 'Test copy · No study credit' : app.hosted ? 'Saved in this browser' : 'Saved on this PC'; }
function acceptState(state) { if (state) app.state = state; saved(); renderSidebar(); }
async function flushEdits() {
  clearTimeout(noteTimer); clearTimeout(draftTimer);
  const note = notePending, draft = draftPending;
  notePending = null; draftPending = null;
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    try {
      if (note) acceptState((await api('/api/notes', note)).state);
      if (draft) acceptState((await api('/api/draft', draft)).state);
    } catch (error) {
      if (note && !notePending) notePending = note;
      if (draft && !draftPending) draftPending = draft;
      throw error;
    }
  });
  return saveQueue;
}

function shell() {
  $('#app').innerHTML = `
    <aside class="sidebar" aria-label="Course navigation">
      <a class="brand" href="#classroom"><span class="brand-mark">a</span><span>AI Academy<small>Your space to learn</small></span></a>
      <div class="student-card"><div class="student-avatar">Y</div><div><strong>Your learning journey</strong><span>Starting from zero</span></div></div>
      <nav class="main-nav" aria-label="Main"><button data-route="classroom">${icon('book')}Classroom</button><button data-route="roadmap">${icon('map')}Learning path</button><button data-route="progress">${icon('chart')}My progress</button><button data-route="notes">${icon('note')}My notes</button></nav>
      <div class="course-label"><span>FIRST WEEK</span><span id="week-count">0 / 7</span></div>
      <nav id="lesson-list" class="lesson-list" aria-label="First week lessons"></nav>
      <div class="sidebar-bottom"><div class="gentle-card">One idea at a time.<p>There is no race. You can revisit any lesson.</p></div><span class="device-label">${icon('check')}Personal classroom · Online</span></div>
    </aside>
    <div class="workspace">
      <header class="topbar"><div class="breadcrumb">My academy<span>/</span><strong id="breadcrumb">Classroom</strong></div><div class="topbar-actions"><span id="save-status" class="save-status">Saved on this PC</span><button class="icon-button" data-action="reading-settings" aria-label="Reading and voice settings">${icon('settings')}</button></div></header>
      <div class="workspace-body"><main id="main" tabindex="-1"></main><aside class="tutor-panel" aria-label="AI tutor"><div class="tutor-header"><div class="tutor-avatar">${icon('chat')}</div><div><h2>Your AI tutor</h2><p id="tutor-status"></p></div><button class="icon-button" data-action="toggle-tutor" aria-label="Hide or show tutor">${icon('chat')}</button></div><p class="tutor-caption">Ask about this lesson. Your tutor has the context.</p><div id="chat-log" class="chat-log" role="log" aria-live="polite" aria-label="Tutor conversation"></div><div class="chat-footer"><div class="quick-prompts"><button data-quick="Please explain the current idea more simply, using the same example.">Explain simply</button><button data-quick="Give me one small hint for this lesson’s practice. Let me try before showing the answer.">Give me a hint</button></div><form id="chat-form"><label class="sr-only" for="chat-input">Message your tutor</label><textarea id="chat-input" maxlength="8000" rows="2" placeholder="Ask anything about this lesson…"></textarea><div class="composer-bottom"><span>Enter to send · Shift+Enter for a new line</span><button id="send-chat" class="send-button" type="submit" aria-label="Send message">Send</button></div></form><button id="stop-reply" class="text-button hidden" data-action="stop-reply">Stop this reply</button><p class="chat-disclosure">Through Codex · Uses your ChatGPT sign-in.<br>Messages go to OpenAI. Check answers that matter.</p></div></aside></div>
    </div><button class="mobile-tutor" data-action="toggle-tutor">${icon('chat')}Ask your tutor</button>
    <div id="speech-player" class="speech-player hidden" role="region" aria-label="Read-aloud player"><span>${icon('sound')}<strong id="speech-label">Reading aloud</strong></span><button class="icon-button" data-action="pause-speech" aria-label="Pause reading">${icon('pause')}</button><button class="icon-button" data-action="stop-speech" aria-label="Stop reading">${icon('stop')}</button></div>`;
  $('#chat-form').addEventListener('submit', event => { event.preventDefault(); sendChat(); });
  $('#chat-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat(); } });
  document.addEventListener('click', handleClick);
  $('#main').addEventListener('input', handleInput);
  renderSidebar(); renderMain(); renderChat();
  $('#tutor-status').textContent = app.tutor.label;
  $('#tutor-status').className = app.tutor.available ? 'connected' : 'not-connected';
  refreshMessages(); saved();
  if (app.job?.id) pollReply(app.job.id, app.job.lesson);
}

function renderSidebar() {
  if (!app.state || !$('#lesson-list')) return;
  const complete = Object.values(app.state.work).filter(row => row.completed).length;
  $('#week-count').textContent = `${complete} / 7`;
  document.querySelectorAll('[data-route]').forEach(button => { button.classList.toggle('active', button.dataset.route === app.route); if (button.dataset.route === app.route) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  $('#lesson-list').innerHTML = app.lessons.map(item => `<button class="lesson-link ${item.id === app.state.settings.lesson && app.route === 'classroom' ? 'selected' : ''}" data-lesson="${item.id}" ${item.id === app.state.settings.lesson ? 'aria-current="step"' : ''}><span class="lesson-number ${app.state.work[item.id].completed ? 'is-complete' : ''}">${app.state.work[item.id].completed ? icon('check') : String(item.day).padStart(2,'0')}</span><span><small>Day ${item.day}</small>${escapeHTML(item.title)}</span></button>`).join('');
}
function pageTop(kicker, title, description, listen = true) {
  return `<div class="page-top"><div><p class="eyebrow">${escapeHTML(kicker)}</p><h1>${escapeHTML(title)}</h1><p class="page-description">${escapeHTML(description)}</p></div>${listen ? `<button class="secondary-button listen-button" data-action="listen-page">${icon('sound')}Listen</button>` : ''}</div>`;
}
function renderMain() {
  const names = {classroom: 'Classroom', roadmap: 'Learning path', progress: 'My progress', notes: 'My notes'};
  $('#breadcrumb').textContent = names[app.route];
  if (app.route === 'roadmap') return renderRoadmap();
  if (app.route === 'progress') return renderProgress();
  if (app.route === 'notes') return renderNotes();
  renderLesson();
}
function visual(kind) {
  if (kind === 'prompt') return `<div class="prompt-diagram" aria-label="Your prompt goes to the AI; its output comes back"><div class="diagram-node"><span class="diagram-icon">${icon('note')}</span><strong>Your prompt</strong><small>The message you send</small></div><div class="flow-line"><span></span></div><div class="diagram-node ai-node"><span class="diagram-icon">a</span><strong>AI</strong><small>Processes your request</small></div><div class="flow-line"><span></span></div><div class="diagram-node"><span class="diagram-icon">${icon('chat')}</span><strong>The output</strong><small>What you get back</small></div></div>`;
  if (kind === 'family') return `<div class="family-diagram" aria-label="AI contains machine learning, which contains deep learning"><div class="family-label"><strong>Artificial intelligence</strong><span>The broad field</span></div><div class="family-ml"><div class="family-label"><strong>Machine learning</strong><span>Learns patterns from examples</span></div><div class="family-dl"><strong>Deep learning</strong><span>Layered neural networks</span></div></div></div>`;
  const items = {
    check: [['Your request', 'Know what you wanted'], ['The result', 'Check what you received']],
    folders: [['A folder', 'The binder that holds pages'], ['A file', 'One saved page inside it']],
    save: [['Edit', 'Make a small change'], ['Save', 'Keep it in the file'], ['Run', 'Check what happens']],
    program: [['Your instructions', 'A small Python program'], ['Python', 'Follows those instructions'], ['The result', 'Text appears on the screen']],
    training: [['Examples', 'Photos with labels'], ['Training', 'Adjust a model'], ['Testing', 'Try different photos']],
    debug: [['Read', 'Look at the error'], ['Investigate', 'Find its cause'], ['Check', 'Run your small fix']],
  }[kind] || [];
  return `<div class="simple-diagram">${items.map(([title, text]) => `<div><span class="diagram-icon">${icon(kind === 'folders' ? 'note' : 'check')}</span><strong>${title}</strong><small>${text}</small></div>`).join('')}</div>`;
}
function renderLesson() {
  const current = lesson(), item = work(), step = item.step, learnCount = current.steps.length;
  const labels = [...current.steps.map(s => s.title), 'Try it yourself', 'Quick check', 'Your checkpoint'];
  const tabs = labels.map((label, index) => `<button data-step="${index}" class="step-tab ${step === index ? 'current' : ''}" aria-label="Step ${index + 1}: ${escapeHTML(label)}" ${step === index ? 'aria-current="step"' : ''}><span>${index < step ? icon('check') : index + 1}</span>${index === step ? `<strong>${escapeHTML(label)}</strong>` : `<span class="step-label">${escapeHTML(label)}</span>`}</button>`).join('');
  let content;
  if (step < learnCount) {
    const part = current.steps[step];
    content = `<article class="content-card"><p class="eyebrow">${escapeHTML(part.tag)}</p><h2>${escapeHTML(part.title)}</h2><div class="lesson-copy">${part.paragraphs.map(p => `<p>${escapeHTML(p)}</p>`).join('')}</div>${part.visual ? visual(part.visual) : ''}${part.code ? `<div class="code-example"><span>Python example</span><pre><code>${escapeHTML(part.code)}</code></pre></div>` : ''}${part.example ? `<div class="example-grid"><div><span>${escapeHTML(part.example[0])}</span><p>${escapeHTML(part.example[1])}</p></div><div><span>${escapeHTML(part.example[2])}</span><p>${escapeHTML(part.example[3])}</p></div></div>` : ''}<div class="takeaway">${icon('check')}<p>${escapeHTML(part.takeaway)}</p></div></article>`;
  } else if (step === learnCount) content = practiceCard();
  else if (step === learnCount + 1) content = quizCard();
  else content = checkpointCard();
  $('#main').innerHTML = `${pageTop('LEVEL 0 · AI EXPLORER', `Day ${current.day} · ${current.title}`, current.subtitle)}<div class="lesson-meta"><span>${icon('book')}About 60 minutes, at your pace</span><span>${item.completed ? `${icon('check')}Activities completed` : 'No experience needed'}</span></div><nav class="step-nav" aria-label="Lesson steps">${tabs}</nav>${content}<div class="lesson-footer"><button class="secondary-button" data-action="previous-step" ${step === 0 ? 'disabled' : ''}>Previous</button><span>Step ${step + 1} of ${labels.length}</span>${step < maxStep() ? `<button class="primary-button" data-action="next-step">${step < learnCount - 1 ? 'Continue' : step === learnCount - 1 ? 'Try it yourself' : step === learnCount ? 'Go to quick check' : 'See my checkpoint'}</button>` : `<button class="primary-button" data-action="${item.completed ? 'next-lesson' : 'complete'}">${item.completed ? current.day === 7 ? 'View learning path' : 'Next lesson' : 'Complete this lesson'}</button>`}</div><p class="lesson-footnote">Need a different explanation? Ask your tutor on the right. Your place is saved as you go.</p>`;
}
function practiceCard() {
  const current = lesson(), item = work(), practice = current.practice;
  const value = item.practice || (practice.kind === 'python' ? practice.starter : '');
  return `<article class="content-card"><p class="eyebrow">YOUR TURN</p><h2>${escapeHTML(practice.title)}</h2><p class="lesson-copy">${escapeHTML(practice.instruction)}</p><label for="practice-input" class="field-label">${practice.kind === 'python' ? 'Your Python code' : 'Your own attempt'}</label><textarea id="practice-input" class="practice-input ${practice.kind === 'python' ? 'code-input' : ''}" rows="7" maxlength="8000" spellcheck="${practice.kind !== 'python'}" placeholder="${escapeHTML(practice.placeholder || 'Write your code here…')}">${escapeHTML(value)}</textarea><div class="practice-actions"><span id="practice-save-hint">${item.practice ? 'Draft saved in this browser' : 'Your draft saves in this browser as you type'}</span><button class="primary-button" data-action="save-practice">${icon(practice.kind === 'python' ? 'play' : 'check')}${practice.kind === 'python' ? 'Run my code' : 'Save my attempt'}</button></div>${practice.kind === 'python' ? `<div class="output-panel ${item.run_error ? 'has-error' : ''}"><div><span>OUTPUT</span><span>${item.output ? item.run_error ? 'A clue to investigate' : 'Run finished' : 'Run your code to see the result'}</span></div><pre id="code-output" aria-live="polite">${escapeHTML(item.output || 'Your printed text will appear here.')}</pre></div><p class="fine-print">Python runs in this browser. The first run downloads its runtime and may take a little longer. This beginner pad supports print, variables, and simple arithmetic.</p>` : ''}${item.practice_feedback ? `<div class="feedback ${item.practice_ok ? 'good' : 'try-again'}"><p>${escapeHTML(item.practice_feedback)}</p></div>` : item.practice_ok ? `<div class="feedback good">${icon('check')}<p>Attempt saved. Ask your tutor to review your reasoning if you are unsure.</p></div>` : ''}</article>`;
}
function quizCard() {
  const current = lesson(), item = work();
  app.quizIndex = Math.max(0, Math.min(app.quizIndex, current.quiz.length - 1));
  const index = app.quizIndex, question = current.quiz[index], answer = item.answers[String(index)];
  const feedback = app.feedback?.lesson === current.id && app.feedback.index === index ? app.feedback : null;
  const locked = Boolean(feedback);
  return `<article class="content-card quiz-card"><div class="quiz-heading"><p class="eyebrow">QUICK CHECK</p><span>Question ${index + 1} of ${current.quiz.length}</span></div><h2>${escapeHTML(question.text)}</h2><p class="muted">Take your time. Choose one answer.</p><div class="quiz-options">${question.options.map((option, choice) => `<button class="quiz-option ${feedback && feedback.choice === choice ? feedback.correct ? 'correct' : 'incorrect' : ''}" data-answer="${choice}" ${locked ? 'disabled' : ''}><span>${String.fromCharCode(65 + choice)}</span>${escapeHTML(option)}${feedback && feedback.choice === choice && feedback.correct ? icon('check') : ''}</button>`).join('')}</div>${feedback ? `<div class="feedback ${feedback.correct ? 'good' : 'try-again'}" role="status"><div><strong>${feedback.correct ? 'That’s right.' : 'Let’s look at that again.'}</strong><p>${escapeHTML(feedback.explanation)}</p></div></div><button class="primary-button" data-action="${feedback.correct ? 'next-question' : 'retry-question'}">${feedback.correct ? index === current.quiz.length - 1 ? 'See my checkpoint' : 'Next question' : 'Try this question again'}</button>` : answer ? `<p class="fine-print">You have answered this before. You can answer again for practice. Your first attempt stays in your record.</p>` : ''}<div class="quiz-position">${current.quiz.map((_, i) => `<button class="quiz-dot ${i === index ? 'selected' : ''} ${item.answers[String(i)]?.correct ? 'passed' : ''}" data-question="${i}" aria-label="Go to question ${i+1}" ${i === index ? 'aria-current="step"' : ''}>${i+1}</button>`).join('')}</div></article>`;
}
function checkpointCard() {
  const current = lesson(), item = work(), passed = Object.keys(item.answers).length === current.quiz.length && item.score / current.quiz.length >= .8;
  return `<article class="content-card"><p class="eyebrow">YOUR CHECKPOINT</p><h2>${item.completed ? 'Your work is saved.' : 'Pause and check your understanding.'}</h2><p class="lesson-copy">${escapeHTML(current.objective)}</p><div class="checkpoint-list"><div>${icon(item.practice_ok ? 'check' : 'note')}<span>Your practice attempt</span><strong>${item.practice_ok ? 'Saved and checked by the activity' : 'Still to do'}</strong><button class="text-button" data-step="${current.steps.length}">Open practice</button></div><div>${icon(passed ? 'check' : 'help')}<span>Your latest quiz</span><strong>${item.score} / ${current.quiz.length} correct</strong><button class="text-button" data-step="${current.steps.length+1}">Review questions</button></div></div><label class="field-label" for="reflection-notes">What can you explain in your own words?</label><textarea id="reflection-notes" class="notes-input" rows="4" maxlength="12000" placeholder="One thing I understand…\nOne thing I want to practice…">${escapeHTML(item.notes)}</textarea><p class="fine-print">Notes save automatically. A tutor review still matters before a level or skill badge is awarded.</p><label class="field-label" for="study-minutes">How many minutes did you study this lesson? <span class="muted">Optional</span></label><div class="minutes-control"><input id="study-minutes" type="number" min="0" max="1440" value="${item.minutes}" aria-label="Reported study minutes"><button class="secondary-button" data-action="save-minutes">Save minutes</button></div>${!passed || !item.practice_ok ? '<div class="feedback try-again"><p>Finish the practice activity and review the quiz before completing this lesson. There is no rush.</p></div>' : '<div class="feedback good"><p>You have finished the required activities. Complete the lesson when you are ready.</p></div>'}</article>`;
}
function renderRoadmap() {
  $('#main').innerHTML = `${pageTop('THE BIGGER PICTURE', 'Your learning path', 'A guide for about a year of study. We will adjust it as you learn.')}<div class="path-intro">${icon('book')}<p><strong>Your first seven lessons are ready.</strong> Later levels are planned. We will add detailed lessons when you reach them.</p></div><div class="roadmap-list">${app.levels.map(level => `<article class="roadmap-card ${level.level === 0 ? 'available' : ''}"><span class="level-index">${String(level.level).padStart(2,'0')}</span><div><div class="roadmap-title"><h2>${escapeHTML(level.title)}</h2><span class="pill ${level.level === 0 ? 'blue-pill' : ''}">${level.level === 0 ? 'Ready to study' : 'Planned'}</span></div><p>${escapeHTML(level.description)}</p><span class="fine-print">Target study days ${escapeHTML(level.days)}</span></div>${level.level === 0 ? '<button class="secondary-button" data-route="classroom">Open classroom</button>' : icon('lock')}</article>`).join('')}</div><p class="lesson-footnote">Study days are practice sessions, not deadlines. We revisit foundations whenever you need it.</p>`;
}
function renderProgress() {
  const items = Object.values(app.state.work), complete = items.filter(row => row.completed).length, minutes = items.reduce((total, row) => total+row.minutes, 0), attempts = items.reduce((total, row) => total+row.attempts, 0);
  $('#main').innerHTML = `${pageTop('YOUR OWN PACE', 'Small steps, real practice.', 'This record comes from your attempts, not from opening a page.', false)}<div class="stats-grid"><div><span>First-week lessons</span><strong>${complete}<small> / 7</small></strong><progress value="${complete}" max="7" aria-label="Completed lessons"></progress></div><div><span>Reported study time</span><strong>${minutes}<small> min</small></strong><p>You choose what to record.</p></div><div><span>Quiz attempts</span><strong>${attempts}</strong><p>Retries are part of learning.</p></div></div><article class="content-card"><h2>Your first week</h2><div class="progress-lessons">${app.lessons.map(current => { const row = app.state.work[current.id]; return `<div><span class="lesson-number ${row.completed ? 'is-complete' : ''}">${row.completed ? icon('check') : current.day}</span><div><strong>${escapeHTML(current.title)}</strong><small>${row.completed ? 'Activities completed' : row.practice || row.attempts || row.notes ? 'In progress' : 'Not started'} · ${row.attempts ? `Latest quiz ${row.score}/${current.quiz.length} · First-try correct ${row.first_score}` : 'Quiz not started'}</small></div><button class="text-button" data-lesson="${current.id}">${row.completed ? 'Revisit' : 'Open'}</button></div>`; }).join('')}</div></article><div class="progress-footer"><p>Saved in this browser. Use export and import to carry your progress to another device. Classroom activity does not automatically verify professional skills.</p><button class="secondary-button" data-action="export">${icon('download')}Export my record</button><button class="secondary-button" data-action="import">Import my record</button></div>`;
}
function renderNotes() {
  $('#main').innerHTML = `${pageTop('PUT IT IN YOUR OWN WORDS', 'Your learning notebook', 'Short notes are enough. Keep what helped the idea make sense.', false)}<article class="content-card"><label class="field-label" for="notes-lesson">Notes for</label><select id="notes-lesson">${app.lessons.map(row => `<option value="${row.id}" ${row.id === lesson().id ? 'selected' : ''}>Day ${row.day}: ${escapeHTML(row.title)}</option>`).join('')}</select><label class="field-label" for="reflection-notes">Your notes</label><textarea id="reflection-notes" class="notes-input notebook-input" rows="14" maxlength="12000" placeholder="What did I learn?\nHow would I explain it to someone?\nWhat do I want to ask next?">${escapeHTML(work().notes)}</textarea><div class="notebook-footer"><span id="note-save-hint">Saved automatically in this browser</span><button class="secondary-button" data-action="listen-notes">${icon('sound')}Read my notes</button></div></article><p class="lesson-footnote">Your notes stay in this browser. Export your record from My progress, then import it on another device to continue.</p>`;
  $('#notes-lesson').addEventListener('change', async event => { try { await chooseLesson(event.target.value, 'notes'); } catch (error) { toast(error.message); } });
}

async function refreshMessages() {
  const id = lesson().id;
  try { const result = await api(`/api/messages?lesson=${encodeURIComponent(id)}`); if (lesson().id === id) { app.messages = result.messages; renderChat(); } } catch (error) { toast(error.message); }
}
function renderChat() {
  if (app.hosted) return renderOnlineTutor();
  if (!$('#chat-log')) return;
  const busy = Boolean(app.job);
  const opening = `<div class="tutor-welcome"><span class="welcome-glyph">${icon('chat')}</span><h3>A question is a good place to start.</h3><p>Ask for a simpler explanation, share your attempt, or tell your tutor where you got stuck.</p><div class="context-badge">${icon('book')}Day ${lesson().day} is in context</div></div>`;
  $('#chat-log').innerHTML = (app.messages.length ? '' : opening) + app.messages.map(message => `<div class="chat-message ${message.role === 'user' ? 'from-user' : 'from-tutor'}"><div class="message-label">${message.role === 'user' ? 'You' : 'AI tutor'}${message.role === 'assistant' ? `<button class="icon-button message-listen" data-read-message="${message.id}" aria-label="Read this tutor reply aloud">${icon('sound')}</button>` : ''}</div><div class="message-text">${escapeHTML(message.content)}</div></div>`).join('') + (busy ? `<div class="working-reply" role="status"><span class="thinking-dot"></span>${app.job.lesson === lesson().id ? 'Your tutor is thinking…' : 'Finishing a reply in another lesson…'}</div>` : '') + (!app.tutor.available ? `<div class="tutor-offline"><strong>${escapeHTML(app.tutor.label)}</strong><p>${escapeHTML(app.tutor.detail)}</p><p>You can still study, practice, and use read-aloud.</p></div>` : '');
  const input = $('#chat-input'); input.disabled = busy || !app.tutor.available;
  $('#send-chat').disabled = busy || !app.tutor.available;
  document.querySelectorAll('[data-quick]').forEach(button => button.disabled = busy || !app.tutor.available);
  $('#stop-reply').classList.toggle('hidden', !busy);
  $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
}
async function sendChat(text) {
  if (app.hosted) return copyForChatGPT(text);
  if (app.job || !app.tutor.available) return;
  const input = $('#chat-input'), message = (text || input.value).trim(); if (!message) return;
  const id = lesson().id;
  try {
    await flushEdits();
    // Set busy before the request so two clicks cannot start duplicate replies.
    app.job = {id: '', lesson: id}; renderChat();
    const result = await api('/api/chat', {lesson: id, message});
    input.value = ''; app.job.id = result.id;
    await refreshMessages();
    pollReply(result.id, id);
  } catch (error) { app.job = null; renderChat(); toast(error.message); }
}
async function pollReply(id, lessonId) {
  try {
    const job = await api(`/api/job?id=${encodeURIComponent(id)}`);
    if (job.status === 'working') { setTimeout(() => pollReply(id, lessonId), 1000); return; }
    app.job = null;
    if (job.status === 'done') {
      if (lesson().id === lessonId) { await refreshMessages(); if (app.state.settings.autoRead) narrator.speak(job.reply); }
      else { renderChat(); toast('Your tutor’s reply is saved in the earlier lesson.'); }
    } else { renderChat(); toast(job.error); }
  } catch (error) { app.job = null; renderChat(); toast(error.message); }
}
async function chooseLesson(id, route = 'classroom') {
  if (navigationBusy) return;
  navigationBusy = true; $('#main').setAttribute('aria-busy','true');
  try {
  await flushEdits(); narrator.stop();
  const result = await api('/api/settings', {lesson: id});
  app.state = result.state; app.route = route; app.quizIndex = 0; app.feedback = null; app.messages = [];
  renderSidebar(); renderMain(); renderChat(); refreshMessages();
  $('#main').scrollTop = 0;
  } finally { navigationBusy = false; $('#main').removeAttribute('aria-busy'); }
}
async function goStep(index) {
  if (navigationBusy) return;
  navigationBusy = true; $('#main').setAttribute('aria-busy','true');
  try {
  await flushEdits(); narrator.stop();
  acceptState((await api('/api/step', {lesson: lesson().id, step: index})).state);
  app.feedback = null;
  if (index === lesson().steps.length + 1) app.quizIndex = Math.max(0, lesson().quiz.findIndex((_, i) => !work().answers[String(i)]?.correct));
  renderMain(); $('#main').scrollTop = 0;
  } finally { navigationBusy = false; $('#main').removeAttribute('aria-busy'); }
}
function handleInput(event) {
  const id = lesson().id;
  if (event.target.id === 'reflection-notes') {
    notePending = {lesson: id, notes: event.target.value};
    $('#save-status').textContent = 'Saving your notes…';
    clearTimeout(noteTimer); noteTimer = setTimeout(() => flushEdits().catch(error => toast(error.message)), 700);
  }
  if (event.target.id === 'practice-input') {
    draftPending = {lesson: id, attempt: event.target.value};
    $('#save-status').textContent = 'Saving your draft…';
    clearTimeout(draftTimer); draftTimer = setTimeout(() => flushEdits().catch(error => toast(error.message)), 800);
  }
}
async function handleClick(event) {
  const button = event.target.closest('button, a.brand'); if (!button || button.disabled) return;
  if (navigationBusy && (button.dataset.lesson || button.dataset.step !== undefined || button.dataset.route || ['next-step','previous-step','next-lesson'].includes(button.dataset.action))) return;
  try {
    if (button.matches('a.brand')) { event.preventDefault(); button.dataset.route = 'classroom'; }
    if (button.dataset.route) { await flushEdits(); narrator.stop(); app.route = button.dataset.route; renderSidebar(); renderMain(); return; }
    if (button.dataset.lesson) return await chooseLesson(button.dataset.lesson);
    if (button.dataset.step !== undefined) return await goStep(Number(button.dataset.step));
    if (button.dataset.quick) return await sendChat(button.dataset.quick);
    if (button.dataset.readMessage) { const message = app.messages.find(row => row.id === Number(button.dataset.readMessage)); if (message) narrator.speak(message.content); return; }
    if (button.dataset.question !== undefined) { app.quizIndex = Number(button.dataset.question); app.feedback = null; renderMain(); return; }
    if (button.dataset.answer !== undefined) {
      document.querySelectorAll('[data-answer]').forEach(item => item.disabled = true);
      const index = app.quizIndex, choice = Number(button.dataset.answer), id = lesson().id;
      const result = await api('/api/answer', {lesson: id, question: index, choice});
      acceptState(result.state); app.feedback = {lesson: id, index, choice, correct: result.correct, explanation: result.explanation}; renderMain(); return;
    }
    switch (button.dataset.action) {
      case 'next-step': await goStep(work().step + 1); break;
      case 'previous-step': await goStep(work().step - 1); break;
      case 'reading-settings': $('#reading-dialog').showModal(); updateVoiceControls(); break;
      case 'listen-page': narrator.speak(pageNarration()); break;
      case 'listen-notes': narrator.speak($('#reflection-notes').value || 'There are no notes to read yet.'); break;
      case 'pause-speech': narrator.toggle(); break;
      case 'stop-speech': narrator.stop(); break;
      case 'toggle-tutor': document.body.classList.toggle('tutor-expanded'); break;
      case 'stop-reply': if (app.job?.id) await api('/api/stop', {id: app.job.id}); break;
      case 'save-practice': {
        button.disabled = true; const text = $('#practice-input').value;
        await flushEdits();
        const result = await api('/api/practice', {lesson: lesson().id, attempt: text});
        acceptState(result.state); renderMain(); toast(result.feedback || (result.ok ? 'Your attempt is saved.' : 'Read the error for a clue. Your attempt is saved.')); break;
      }
      case 'retry-question': app.feedback = null; renderMain(); break;
      case 'next-question': if (app.quizIndex + 1 < lesson().quiz.length) { app.quizIndex++; app.feedback = null; renderMain(); } else await goStep(maxStep()); break;
      case 'save-minutes': acceptState((await api('/api/minutes', {lesson: lesson().id, minutes: Number($('#study-minutes').value)})).state); toast('Your reported study time is saved.'); break;
      case 'complete': await flushEdits(); acceptState((await api('/api/complete', {lesson: lesson().id})).state); renderMain(); toast('Lesson activities completed. Your work is saved.'); break;
      case 'next-lesson': if (lesson().day < 7) await chooseLesson(`day-${lesson().day + 1}`); else { app.route = 'roadmap'; renderSidebar(); renderMain(); } break;
      case 'export': { await flushEdits(); const record = await api('/api/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], {type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = 'academy-progress.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Your learning record has been exported.'); break; }
      case 'import': $('#progress-import').click(); break;
    }
  } catch (error) { toast(error.message); if (button.isConnected) button.disabled = false; if (button.dataset.answer !== undefined) renderMain(); }
}

function renderOnlineTutor() {
  $('#tutor-status').textContent = 'Continue in ChatGPT';
  $('.tutor-caption').textContent = 'Take this lesson and your question into your ChatGPT account.';
  $('#chat-log').innerHTML = `<div class="tutor-welcome"><span class="welcome-glyph">${icon('chat')}</span><h3>Study here. Ask in ChatGPT.</h3><p>Write your question below and click <strong>Copy lesson + question</strong>. Then open ChatGPT and paste it into a chat.</p><a class="primary-button" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Open ChatGPT</a><p class="fine-print">ChatGPT opens in another tab. Replies stay there. No API key is needed.</p><div class="context-badge">${icon('book')}Day ${lesson().day} goes with your question</div></div><div id="copy-fallback" class="hidden"><label class="field-label" for="context-copy">Select and copy this text</label><textarea id="context-copy" class="notes-input" rows="7" readonly></textarea></div>`;
  $('#chat-input').disabled = false;
  $('#chat-input').placeholder = 'What would you like to ask ChatGPT?';
  const send = $('#send-chat'); send.disabled=false; send.textContent='Copy lesson + question'; send.setAttribute('aria-label','Copy lesson and question for ChatGPT');
  document.querySelectorAll('[data-quick]').forEach(button=>button.disabled=false);
  $('#stop-reply').classList.add('hidden');
  $('.composer-bottom>span').textContent = 'Your question stays private until you paste it into ChatGPT.';
  $('.chat-disclosure').textContent = 'GitHub hosts the lessons. Your study record stays in this browser.';
}
async function copyForChatGPT(text) {
  try {
    await flushEdits();
    const current=lesson(), item=work();
    const question=(text || $('#chat-input').value).trim() || 'Help me understand the current lesson, one small step at a time.';
    const context = `I am a complete beginner learning AI engineering. Use simple English, explain new words, and ask at most one question at a time. Give hints before exercise solutions.\n\nCurrent lesson: Day ${current.day}: ${current.title}\nGoal: ${current.objective}\nCurrent page: ${work().step < current.steps.length ? current.steps[work().step].title : 'Practice or quick check'}\nLesson context:\n${current.steps.map(step=>step.paragraphs.join(' ')).join('\n')}\n\nMy notes:\n${item.notes.slice(-3000)}\n\nMy practice:\n${item.practice.slice(-3000)}\n\nMy question: ${question}`;
    try { await navigator.clipboard.writeText(context); toast('Copied. Open ChatGPT and paste your lesson and question.'); }
    catch { $('#copy-fallback').classList.remove('hidden'); $('#context-copy').value=context; toast('Copy the prepared text, then paste it into ChatGPT.'); }
  } catch(error) { toast(error.message); }
}

function pageNarration() {
  if (app.route !== 'classroom') return $('#main').innerText;
  const current = lesson(), step = work().step;
  if (step < current.steps.length) {
    const part = current.steps[step];
    return [part.title, ...part.paragraphs, ...(part.example || []), part.takeaway].filter(Boolean).join('. ');
  }
  if (step === current.steps.length) return `${current.practice.title}. ${current.practice.instruction}`;
  if (step === current.steps.length + 1) { const question = current.quiz[app.quizIndex]; return [question.text, ...question.options.map((option,i) => `${String.fromCharCode(65+i)}. ${option}`)].join('. '); }
  return `Your checkpoint. ${current.objective}. Record what you can explain in your own words.`;
}

const narrator = {
  generation: 0, utterance: null, paused: false, audio: null, audioUrl: null, controller: null,
  speak(text) {
    if (app.hosted && app.recordings && !app.state.settings.voice.startsWith('browser:')) {
      let recording = null;
      if (text === 'Welcome to your classroom. We will learn one small idea at a time.') recording=app.recordings.preview;
      else if (app.route === 'classroom' && text === pageNarration()) {
        const page=app.recordings[lesson().id];
        recording=work().step===lesson().steps.length+1 ? page?.quiz?.[app.quizIndex] : page?.steps?.[work().step];
      }
      if (recording) { this.speakRecording(recording); return; }
    }
    if (app.speech?.available && !app.state.settings.voice.startsWith('browser:')) { this.speakWindows(text); return; }
    if (!('speechSynthesis' in window)) { toast('Read-aloud is not available in this browser. Try Chrome or Edge.'); return; }
    this.stop(); if (!text.trim()) return;
    const generation = this.generation;
    const cleaned = text.replace(/```[\s\S]*?```/g, ' Code example. Please read the code on screen. ').replace(/[*#`]/g, '');
    const chunks = cleaned.match(/[^.!?\n]+[.!?\n]*/g) || [cleaned];
    let index = 0;
    const speakNext = () => {
      if (generation !== this.generation) return;
      if (index >= chunks.length) { this.utterance = null; $('#speech-player').classList.add('hidden'); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]); this.utterance = utterance;
      utterance.rate = app.state.settings.rate; utterance.lang = 'en-US';
      const voices = speechSynthesis.getVoices();
      const selected = app.state.settings.voice.replace(/^browser:/, '');
      const voice = voices.find(item => item.name === selected) || voices.find(item => item.lang.startsWith('en') && item.localService) || voices.find(item => item.lang.startsWith('en'));
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      utterance.onend = speakNext;
      utterance.onerror = error => { if (generation === this.generation && !['interrupted','canceled'].includes(error.error)) { this.stop(); toast('The voice could not start. Try another voice in reading settings.'); } };
      speechSynthesis.speak(utterance);
    };
    $('#speech-player').classList.remove('hidden'); $('#speech-label').textContent = 'Reading aloud';
    $('[data-action="pause-speech"]').innerHTML = icon('pause'); $('[data-action="pause-speech"]').setAttribute('aria-label', 'Pause reading');
    speakNext();
  },
  async speakWindows(text) {
    this.stop(); if (!text.trim()) return;
    const generation = this.generation;
    const cleaned = text.replace(/```[\s\S]*?```/g, ' Code example. Please read the code on screen. ').replace(/[*#`]/g, '');
    const chunks = []; let remaining = cleaned;
    while (remaining.length) {
      let end = Math.min(2800, remaining.length);
      if (end < remaining.length) { const space = remaining.lastIndexOf(' ', end); if (space > end / 2) end = space; }
      chunks.push(remaining.slice(0,end)); remaining = remaining.slice(end).trimStart();
    }
    this.audio = new Audio();
    $('#speech-player').classList.remove('hidden');
    const nextChunk = async index => {
      if (generation !== this.generation) return;
      if (index >= chunks.length) { this.stop(); return; }
      $('#speech-label').textContent = 'Preparing the voice…';
      const pause = $('[data-action="pause-speech"]'); pause.disabled = true;
      this.controller = new AbortController();
      try {
        const response = await fetch('/api/speech', {method:'POST',headers:{'Content-Type':'application/json','X-Academy-Token':app.token},
          body:JSON.stringify({text:chunks[index],voice:app.state.settings.voice.replace(/^windows:/,''),rate:app.state.settings.rate}),signal:this.controller.signal});
        if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'The voice could not start.'); }
        const blob = await response.blob(); if (generation !== this.generation) return;
        if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
        this.audioUrl = URL.createObjectURL(blob); this.audio.src = this.audioUrl;
        this.audio.onended = () => nextChunk(index + 1);
        this.audio.onerror = () => { if (generation === this.generation) { this.stop(); toast('Audio could not play. Try another voice in reading settings.'); } };
        await this.audio.play();
        if (generation !== this.generation) return;
        pause.disabled = false; pause.innerHTML = icon('pause'); pause.setAttribute('aria-label','Pause reading');
        $('#speech-label').textContent = 'Reading aloud';
      } catch (error) {
        if (generation === this.generation) { this.stop(); if (error.name !== 'AbortError') toast(error.message || 'Click Listen again to start audio.'); }
      }
    };
    nextChunk(0);
  },
  speakRecording(url) {
    this.stop();
    const generation=this.generation;
    this.audio=new Audio(url); this.audio.playbackRate=app.state.settings.rate/.9;
    this.audio.onended=()=>{if(generation===this.generation)this.stop();};
    this.audio.onerror=()=>{if(generation===this.generation){this.stop();toast('This recording could not load. Check your connection and try again.');}};
    $('#speech-player').classList.remove('hidden'); $('#speech-label').textContent='Reading aloud';
    const pause=$('[data-action="pause-speech"]');pause.disabled=false;pause.innerHTML=icon('pause');pause.setAttribute('aria-label','Pause reading');
    this.audio.play().catch(()=>{if(generation===this.generation){this.stop();toast('Click Listen again to start the lesson recording.');}});
  },
  toggle() {
    if (!this.utterance && !this.audio) return;
    this.paused = !this.paused;
    if (this.audio) { if (this.paused) this.audio.pause(); else this.audio.play().catch(() => toast('Click Listen again to resume.')); }
    else { if (this.paused) speechSynthesis.pause(); else speechSynthesis.resume(); }
    $('#speech-label').textContent = this.paused ? 'Reading paused' : 'Reading aloud';
    const button = $('[data-action="pause-speech"]'); button.innerHTML = icon(this.paused ? 'play' : 'pause'); button.setAttribute('aria-label', this.paused ? 'Resume reading' : 'Pause reading');
  },
  stop() {
    this.generation++; this.paused = false; this.utterance = null;
    if (this.controller) { this.controller.abort(); this.controller = null; }
    if (this.audio) { this.audio.onended = null; this.audio.onerror = null; this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); this.audio = null; }
    if (this.audioUrl) { URL.revokeObjectURL(this.audioUrl); this.audioUrl = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel(); $('#speech-player')?.classList.add('hidden');
    const pause = $('[data-action="pause-speech"]'); if (pause) pause.disabled = false;
  }
};
function updateVoiceControls() {
  const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices().filter(voice => voice.lang.startsWith('en')).sort((a,b) => Number(b.localService)-Number(a.localService) || a.name.localeCompare(b.name)) : [];
  $('#voice-select').innerHTML = `<option value="">${app.recordings ? 'Recorded lesson voice' : app.speech?.available ? 'Default Windows voice · Local' : 'Default browser voice'}</option>` + (app.speech?.voices || []).map(voice => `<option value="windows:${escapeHTML(voice.name)}">${escapeHTML(voice.name)} · Windows</option>`).join('') + voices.map(voice => `<option value="browser:${escapeHTML(voice.name)}">${escapeHTML(voice.name)} · Browser${voice.localService ? '' : ' (online)'}</option>`).join('');
  if (app.state) { $('#voice-select').value = app.state.settings.voice; $('#speed-select').value = String(app.state.settings.rate); $('#auto-read').checked = app.state.settings.autoRead; }
}
async function saveVoiceSettings() {
  try { acceptState((await api('/api/settings', {voice: $('#voice-select').value, rate: Number($('#speed-select').value), autoRead: $('#auto-read').checked})).state); } catch (error) { toast(error.message); }
}
$('#close-reading').addEventListener('click', () => $('#reading-dialog').close());
$('#test-voice').addEventListener('click', async () => { await saveVoiceSettings(); narrator.speak('Welcome to your classroom. We will learn one small idea at a time.'); });
['voice-select','speed-select','auto-read'].forEach(id => $('#'+id).addEventListener('change', saveVoiceSettings));
if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', updateVoiceControls);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushEdits().catch(() => {}); });

(async () => {
  try {
    const data = await api('/api/bootstrap'); Object.assign(app, data); shell(); updateVoiceControls();
  } catch (error) {
    $('#app').innerHTML = `<div class="loading-screen"><span class="brand-mark">a</span><h1>Let’s reopen your classroom.</h1><p>${escapeHTML(error.message)}</p><p>Refresh this page. If your saved record needs recovery, ask your tutor before clearing browser data.</p></div>`;
  }
})();

const progressImport=document.createElement('input');progressImport.type='file';progressImport.accept='.json,application/json';progressImport.id='progress-import';progressImport.hidden=true;document.body.append(progressImport);
progressImport.addEventListener('change',async()=>{const file=progressImport.files[0];if(!file)return;try{if(file.size>5000000)throw new Error('Choose an export smaller than 5 MB.');await flushEdits();const result=await api('/api/import',JSON.parse(await file.text()));acceptState(result.state);renderMain();renderChat();toast('Your imported record was merged with this browser’s work.');}catch(error){toast(error.message);}finally{progressImport.value='';}});
