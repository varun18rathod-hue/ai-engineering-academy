/* GitHub Pages storage adapter. No credentials or study records are shipped. */
'use strict';
(() => {
  const KEY = 'ai-academy-progress-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const timestamp = () => new Date().toISOString();
  let course, record;
  const ready = fetch('./course.json').then(response => {
    if (!response.ok) throw new Error('The lesson files could not load. Refresh this page.');
    return response.json();
  }).then(value => { course = value; record = read(); });

  function fresh() {
    const work = Object.fromEntries(course.lessons.map(lesson => [lesson.id, {
      lesson: lesson.id, step: 0, notes: '', practice: '', output: '', practice_ok: 0,
      practice_feedback: '', run_error: 0, completed: null, minutes: 0,
    }]));
    return {format: 1, settings: {lesson:'day-1',rate:.9,voice:'',autoRead:false}, work, answers:[], messages:[]};
  }
  function read() {
    const saved = localStorage.getItem(KEY);
    if (!saved) return fresh();
    try {
      const parsed = JSON.parse(saved);
      if (parsed.format !== 1 || !parsed.work || !Array.isArray(parsed.answers) || !Array.isArray(parsed.messages)) throw new Error();
      return parsed;
    } catch {
      throw new Error('Your saved record could not be read. Your stored data has been kept; ask your tutor for help recovering it.');
    }
  }
  function mutate(change) {
    const next = clone(read());
    change(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { throw new Error('This browser could not save the change. Free some browser storage, or export your record before continuing.'); }
    record = next;
    return snapshot();
  }
  function snapshot() {
    const work = clone(record.work);
    for (const lesson of course.lessons) {
      const latest = {}, first = {};
      const attempts = record.answers.filter(answer => answer.lesson === lesson.id);
      for (const answer of attempts) { latest[answer.question] = clone(answer); first[answer.question] ||= clone(answer); }
      Object.assign(work[lesson.id], {answers:latest,score:Object.values(latest).reduce((sum,a)=>sum+a.correct,0),
        first_score:Object.values(first).reduce((sum,a)=>sum+a.correct,0),attempts:attempts.length});
    }
    return {settings:clone(record.settings),work};
  }
  function lessonById(id) {
    const lesson = course.lessons.find(item => item.id === id);
    if (!lesson) throw new Error('Choose an available lesson.');
    return lesson;
  }
  function boundedText(value, limit, name) {
    if (typeof value !== 'string' || value.length > limit) throw new Error(`${name} is too long or has an invalid format.`);
    return value;
  }
  function whole(value, low, high) {
    if (!Number.isInteger(value) || value < low || value > high) throw new Error('The record contains an invalid number.');
    return value;
  }
  function exportRecord() {
    return {format:1,exported_at:timestamp(),state:snapshot(),answers:clone(record.answers),messages:clone(record.messages)};
  }
  function importRecord(incoming) {
    if (!incoming || incoming.format !== 1 || !incoming.state?.work) throw new Error('Choose an academy progress export.');
    const next = clone(read());
    for (const lesson of course.lessons) {
      const source = incoming.state.work[lesson.id];
      if (!source) continue;
      const target = next.work[lesson.id];
      const notes = boundedText(source.notes || '',12000,'Notes');
      if (notes && target.notes !== notes && !target.notes.includes(notes)) {
        target.notes = target.notes ? `${target.notes}\n\nImported notes:\n${notes}` : notes;
        if (target.notes.length > 12000) throw new Error('Merging these notes would exceed the limit. Keep your export and ask your tutor for help.');
      }
      const attempt = boundedText(source.practice || '',8000,'Practice');
      if (attempt && (!target.practice || (!target.practice_ok && source.practice_ok))) {
        target.practice = attempt;
        target.output = boundedText(source.output || '',16000,'Output');
        target.practice_ok = source.practice_ok ? 1 : 0;
        target.run_error = source.run_error ? 1 : 0;
        target.practice_feedback = boundedText(source.practice_feedback || '',1000,'Practice feedback');
      }
      target.step = Math.max(target.step,whole(source.step ?? 0,0,lesson.steps.length+2));
      target.minutes = Math.max(target.minutes,whole(source.minutes ?? 0,0,1440));
      if (typeof source.completed === 'string' && !Number.isNaN(Date.parse(source.completed))) target.completed ||= source.completed;
    }
    const seen = new Set(next.answers.map(a => JSON.stringify([a.lesson,a.question,a.choice,a.created])));
    const sourceAnswers = Array.isArray(incoming.answers) ? incoming.answers : [];
    if (sourceAnswers.length > 20000) throw new Error('This export contains too many attempts.');
    for (const entry of sourceAnswers) {
      const lesson = lessonById(entry.lesson);
      const index = whole(entry.question,0,lesson.quiz.length-1);
      const choice = whole(entry.choice,0,lesson.quiz[index].options.length-1);
      if (typeof entry.created !== 'string' || Number.isNaN(Date.parse(entry.created))) throw new Error('An attempt has an invalid date.');
      const key = JSON.stringify([entry.lesson,index,choice,entry.created]);
      if (!seen.has(key)) {
        seen.add(key);
        next.answers.push({id:next.answers.length+1,lesson:entry.lesson,question:index,choice,correct:Number(choice===lesson.quiz[index].correct),created:entry.created});
      }
    }
    next.answers.sort((a,b) => a.created.localeCompare(b.created));
    const messageKeys = new Set(next.messages.map(m=>JSON.stringify([m.lesson,m.role,m.content,m.created])));
    const sourceMessages = Array.isArray(incoming.messages) ? incoming.messages : [];
    if (sourceMessages.length > 2000) throw new Error('This export contains too many chat messages.');
    for (const entry of sourceMessages) {
      lessonById(entry.lesson);
      if (!['user','assistant'].includes(entry.role) || typeof entry.created !== 'string' || Number.isNaN(Date.parse(entry.created))) throw new Error('A message has an invalid format.');
      const content = boundedText(entry.content,16000,'Message');
      const key = JSON.stringify([entry.lesson,entry.role,content,entry.created]);
      if (!messageKeys.has(key)) { messageKeys.add(key); next.messages.push({id:next.messages.length+1,lesson:entry.lesson,role:entry.role,content,created:entry.created}); }
    }
    try { localStorage.setItem(KEY,JSON.stringify(next)); }
    catch { throw new Error('There is not enough browser storage for this import. Your previous record is unchanged.'); }
    record = next;
    return snapshot();
  }

  let worker, requestNumber = 0;
  const runs = new Map();
  function runPython(code) {
    if (!code.trim()) return Promise.reject(new Error('Write a short program first.'));
    if (!worker) {
      worker = new Worker('./python-worker.js',{type:'module'});
      worker.onmessage = ({data}) => {
        const pending = runs.get(data.id); if (!pending) return;
        if (data.loading) return;
        clearTimeout(pending.timer); runs.delete(data.id);
        if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data.output);
      };
      worker.onerror = () => resetWorker('Python could not load. Check your connection and try again.');
    }
    return new Promise((resolve,reject) => {
      const id = ++requestNumber;
      const timer = setTimeout(()=>resetWorker('Python took too long. Check your connection and try a smaller program.'),60000);
      runs.set(id,{resolve,reject,timer}); worker.postMessage({id,code});
    });
  }
  function resetWorker(message) {
    worker?.terminate(); worker = null;
    for (const item of runs.values()) { clearTimeout(item.timer); item.reject(new Error(message)); }
    runs.clear();
  }
  function activityCheck(lesson,code,output) {
    const lines = output.split('\n').filter(line=>line.trim());
    if (output.startsWith('(No printed output') || !lines.length) return [false,'Add a print instruction that shows the result requested in the activity.'];
    if (['day-3','day-4'].includes(lesson.id) && code.trim() === lesson.practice.starter.trim()) return [false,'The demonstration runs. Now change it as the activity asks and run your own version.'];
    if (['day-4','day-7'].includes(lesson.id) && lines.length < 2) return [false,'This activity needs two printed lines. Add the second line and run again.'];
    return [true,'Your program ran and met the basic checks. Explain it to your tutor too.'];
  }

  async function api(path,data) {
    await ready;
    record = read();
    const url = new URL(path,'https://classroom.invalid');
    if (url.pathname === '/api/bootstrap') return {
      hosted:true,token:'',qa:false,speech:{available:false,voices:[]},job:null,recordings:course.recordings||null,
      tutor:{available:false,label:'Continue in ChatGPT',detail:'Copy your question and lesson, then open ChatGPT.'},
      lessons:course.lessons.map(lesson=>({...lesson,quiz:lesson.quiz.map(({correct,explanation,...question})=>question)})),
      levels:course.levels,state:snapshot(),
    };
    if (url.pathname === '/api/export') return exportRecord();
    if (url.pathname === '/api/import') return {state:importRecord(data)};
    if (url.pathname === '/api/messages') return {messages:clone(record.messages.filter(row=>row.lesson===url.searchParams.get('lesson')).slice(-80))};
    if (url.pathname === '/api/settings') {
      const state = mutate(next=>{
        if (data.lesson !== undefined) { lessonById(data.lesson); next.settings.lesson=data.lesson; }
        if (data.rate !== undefined) { if (![.75,.9,1,1.15].includes(data.rate)) throw new Error('Choose a reading speed.'); next.settings.rate=data.rate; }
        if (data.voice !== undefined) next.settings.voice=boundedText(data.voice,250,'Voice');
        if (data.autoRead !== undefined) next.settings.autoRead=data.autoRead===true;
      });
      return {state};
    }
    const lesson = lessonById(data?.lesson);
    if (url.pathname === '/api/step') return {state:mutate(next=>next.work[lesson.id].step=whole(data.step,0,lesson.steps.length+2))};
    if (url.pathname === '/api/notes') return {state:mutate(next=>next.work[lesson.id].notes=boundedText(data.notes,12000,'Notes'))};
    if (url.pathname === '/api/minutes') return {state:mutate(next=>next.work[lesson.id].minutes=whole(data.minutes,0,1440))};
    if (url.pathname === '/api/draft') return {state:mutate(next=>{
      const item = next.work[lesson.id], attempt=boundedText(data.attempt,8000,'Practice');
      if (item.practice !== attempt) Object.assign(item,{practice:attempt,practice_ok:0,output:'',run_error:0,practice_feedback:''});
    })};
    if (url.pathname === '/api/practice') {
      const attempt = boundedText(data.attempt,8000,'Practice');
      if (lesson.practice.kind !== 'python') {
        if (attempt.trim().length<12) throw new Error('Write a short attempt in your own words first.');
        return {ok:true,state:mutate(next=>Object.assign(next.work[lesson.id],{practice:attempt,practice_ok:1}))};
      }
      try {
        const output = await runPython(attempt);
        const [complete,feedback]=activityCheck(lesson,attempt,output);
        return {ok:true,output,feedback,state:mutate(next=>Object.assign(next.work[lesson.id],{practice:attempt,output,practice_ok:Number(complete),run_error:0,practice_feedback:feedback}))};
      } catch(error) {
        return {ok:false,output:error.message,state:mutate(next=>Object.assign(next.work[lesson.id],{practice:attempt,output:error.message,practice_ok:0,run_error:1,practice_feedback:'Read the message for a clue. Your attempt is saved.'}))};
      }
    }
    if (url.pathname === '/api/answer') {
      const index=whole(data.question,0,lesson.quiz.length-1), question=lesson.quiz[index], choice=whole(data.choice,0,question.options.length-1), correct=choice===question.correct;
      return {correct,explanation:question.explanation,state:mutate(next=>next.answers.push({id:next.answers.length+1,lesson:lesson.id,question:index,choice,correct:Number(correct),created:timestamp()}))};
    }
    if (url.pathname === '/api/complete') {
      const item=snapshot().work[lesson.id];
      if (!item.practice_ok) throw new Error('Finish the practice activity first.');
      if (Object.keys(item.answers).length < lesson.quiz.length || item.score/lesson.quiz.length<.8) throw new Error('Review the quiz questions you missed before completing this lesson.');
      return {state:mutate(next=>next.work[lesson.id].completed ||= timestamp())};
    }
    throw new Error('This action needs the local classroom. Use ChatGPT for online tutor questions.');
  }
  window.AcademyPages = {api,ready,exportRecord,importRecord};
})();
