import {loadPyodide} from 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/pyodide.mjs';

let pythonReady;
function initialize() {
  return pythonReady ||= (async()=>{
    const python = await loadPyodide({indexURL:'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/'});
    const response = await fetch('./practice-runtime.py');
    if (!response.ok) throw new Error('The practice runtime could not load.');
    python.runPython(await response.text());
    return python;
  })();
}
self.onmessage = async ({data}) => {
  try {
    self.postMessage({id:data.id,loading:true});
    const python = await initialize();
    const run = python.globals.get('run_practice');
    try { self.postMessage({id:data.id,output:String(run(data.code))}); }
    finally { run.destroy(); }
  } catch(error) {
    const message = String(error.message || error);
    const friendly = message.match(/PracticeError: ([\s\S]*?)(?:\n|$)/)?.[1] || 'Python could not run this attempt. Check your connection and try again.';
    self.postMessage({id:data.id,error:friendly});
  }
};
