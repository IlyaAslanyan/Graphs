(() => {
  const $ = (selector) => document.querySelector(selector);
  const svg = $('#graph-canvas');
  const edgeLayer = $('#edge-layer');
  const nodeLayer = $('#node-layer');
  const state = {
    graph: null,
    selectedNode: null,
    connectMode: false,
    connectStart: null,
    result: null,
    stepIndex: -1,
    timer: null,
    dragging: null,
    dragged: false,
    exercise: null,
    exerciseView: 'original',
    sourceGraph: null,
    cutGraphView: false,
    sampleTitle: 'My graph',
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function setResult(message, type = '') {
    const strip = $('#result-strip');
    strip.classList.toggle('error', type === 'error');
    strip.classList.toggle('exercise', type === 'exercise');
    $('#result-text').textContent = message;
  }

  function stopPlayback() {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = null;
    $('#play-icon').textContent = '▶';
    $('#play-label').textContent = 'Play';
  }

  function clearRun() {
    stopPlayback();
    if (state.cutGraphView && state.sourceGraph) {
      state.graph = clone(state.sourceGraph);
      $('#graph-title').textContent = state.graph.title || state.sampleTitle;
    }
    if (state.exercise && state.exerciseView === 'complement') {
      state.graph = { ...state.exercise.originalGraph, title: state.sampleTitle };
      $('#graph-title').textContent = state.graph.title;
    }
    state.result = null;
    state.stepIndex = -1;
    state.exercise = null;
    state.sourceGraph = null;
    state.cutGraphView = false;
    $('#view-toggle').hidden = true;
    $('#trace-details').hidden = true;
    $('#trace-details').replaceChildren();
    $('#canvas-hint').textContent = 'Drag nodes to arrange your graph';
    if (state.graph) fillNodeSelects();
    updatePlayback();
    renderGraph();
  }

  function fillNodeSelects() {
    const nodes = state.graph.nodes;
    const start = $('#start-select');
    const target = $('#target-select');
    const previousStart = start.value;
    const previousTarget = target.value;
    const options = nodes.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.id)}</option>`).join('');
    start.innerHTML = options;
    target.innerHTML = options;
    if (nodes.some((node) => node.id === previousStart)) start.value = previousStart;
    else if (state.selectedNode && nodes.some((node) => node.id === state.selectedNode)) start.value = state.selectedNode;
    if (nodes.some((node) => node.id === previousTarget)) target.value = previousTarget;
    else if (nodes.length > 1) target.selectedIndex = 1;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function exampleChanged() {
    const example = window.GRAPH_EXAMPLES.find((item) => item.id === $('#example-select').value);
    if (!example) return;
    clearRun();
    stopPlayback();
    state.graph = clone(example);
    state.sampleTitle = example.title;
    state.selectedNode = example.nodes[0]?.id || null;
    state.connectMode = false;
    $('#connect-mode').classList.remove('active');
    $('#directed-toggle').checked = example.directed;
    $('#weighted-toggle').checked = example.weighted;
    $('#sample-description').textContent = `${example.difficulty} · ${example.edges.length} edges. ${example.description}`;
    $('#graph-title').textContent = example.title;
    $('#canvas-hint').textContent = 'Drag nodes to arrange this example';
    setResult('Choose an algorithm and press Run to see how it works.');
    fillNodeSelects();
    updateControls();
  }

  function updateControls() {
    const algorithm = $('#algorithm-select').value;
    $('#target-picker').hidden = algorithm !== 'dijkstra';
    $('#node-pickers').classList.toggle('single-picker', algorithm === 'articulation');
    $('#weight-control').classList.toggle('show', $('#weighted-toggle').checked);
    $('#directed-toggle').disabled = algorithm === 'articulation';
    if (algorithm === 'articulation' && $('#directed-toggle').checked) {
      $('#directed-toggle').checked = false;
      state.graph.directed = false;
    }
    renderGraph();
  }

  function getStep() {
    if (!state.result || state.stepIndex < 0) return null;
    return state.result.steps[state.stepIndex] || null;
  }

  function edgeMatches(edge, activeEdge) {
    if (!activeEdge) return false;
    return (edge.from === activeEdge.from && edge.to === activeEdge.to) ||
      (!state.graph.directed && edge.from === activeEdge.to && edge.to === activeEdge.from);
  }

  function isPathEdge(edge) {
    if (!state.result?.path || state.result.path.length < 2 || state.stepIndex < state.result.steps.length - 1) return false;
    for (let index = 0; index < state.result.path.length - 1; index += 1) {
      const from = state.result.path[index];
      const to = state.result.path[index + 1];
      if ((edge.from === from && edge.to === to) || (!state.graph.directed && edge.from === to && edge.to === from)) return true;
    }
    return false;
  }

  function renderGraph() {
    if (!state.graph) return;
    const step = getStep();
    const visited = new Set(step?.visited || []);
    const cutPoints = new Set(step?.articulationPoints || state.result?.articulationPoints || []);
    edgeLayer.replaceChildren();
    nodeLayer.replaceChildren();

    for (const edge of state.graph.edges) {
      const from = state.graph.nodes.find((node) => node.id === edge.from);
      const to = state.graph.nodes.find((node) => node.id === edge.to);
      if (!from || !to) continue;
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      line.setAttribute('x1', from.x + ux * 20);
      line.setAttribute('y1', from.y + uy * 20);
      line.setAttribute('x2', to.x - ux * 22);
      line.setAttribute('y2', to.y - uy * 22);
      line.setAttribute('class', `edge${edgeMatches(edge, step?.activeEdge) ? ' active-edge' : ''}${isPathEdge(edge) ? ' path-edge' : ''}`);
      if (state.graph.directed) line.setAttribute('marker-end', 'url(#arrow)');
      group.append(line);
      if (edge.blocks?.length) {
        const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        tooltip.textContent = `These cut vertices share block${edge.blocks.length === 1 ? '' : 's'} ${edge.blocks.join(', ')}.`;
        group.append(tooltip);
      }
      if ($('#weighted-toggle').checked && !state.graph.hideWeights) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', (from.x + to.x) / 2);
        label.setAttribute('y', (from.y + to.y) / 2 - 5);
        label.setAttribute('class', 'edge-label');
        label.textContent = edge.weight;
        group.append(label);
      }
      group.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.exercise || state.cutGraphView) return;
        if (state.result) clearRun();
        const next = window.prompt(`Set weight for ${edge.from} — ${edge.to}:`, String(edge.weight));
        if (next === null) return;
        const weight = Number(next);
        if (!Number.isInteger(weight) || weight < 0 || weight > 999) {
          setResult('Edge weights must be whole numbers from 0 to 999.', 'error');
          return;
        }
        edge.weight = weight;
        renderGraph();
      });
      edgeLayer.append(group);
    }

    for (const node of state.graph.nodes) {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('transform', `translate(${node.x} ${node.y})`);
      group.setAttribute('class', [
        'node-group',
        node.id === state.selectedNode ? 'selected' : '',
        node.id === step?.current ? 'current' : '',
        visited.has(node.id) ? 'visited' : '',
        cutPoints.has(node.id) ? 'cut' : '',
      ].filter(Boolean).join(' '));
      group.dataset.id = node.id;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '20');
      circle.setAttribute('class', 'node-circle');
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('class', 'node-label');
      label.textContent = node.id;
      group.append(circle, label);
      group.addEventListener('pointerdown', (event) => beginDrag(event, node));
      group.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.dragged) { state.dragged = false; return; }
        if (state.exercise || state.cutGraphView) return;
        if (state.result) clearRun();
        if (state.connectMode) connectNode(node.id);
        else {
          state.selectedNode = node.id;
          $('#start-select').value = node.id;
          $('#edit-hint').textContent = `${node.id} selected. Click another node to connect, or use the start-node menu.`;
          renderGraph();
        }
      });
      nodeLayer.append(group);
    }
    renderTraceDetails(step);
    updatePlayback();
  }

  function renderTraceDetails(step) {
    const panel = $('#trace-details');
    panel.replaceChildren();
    const entries = [];
    if (step?.frontier?.length) {
      const label = state.result.algorithm === 'dfs' ? 'Stack' : 'Queue';
      entries.push([label, step.frontier.join('  ·  ')]);
    }
    if (step?.distances && Object.keys(step.distances).length) {
      entries.push(['Distances', Object.entries(step.distances).map(([id, value]) => `${id}: ${value === null ? '∞' : value}`).join('   ') ]);
    }
    if (step?.discovery && Object.keys(step.discovery).length) {
      entries.push(['Discovery / low', Object.keys(step.discovery).map((id) => `${id}: ${step.discovery[id]}/${step.low[id]}`).join('   ') ]);
      entries.push(['Cut vertices', (step.articulationPoints || []).join(', ') || 'None found yet']);
    }
    const visibleBlocks = step?.blocks || (!step && state.result?.blocks);
    if (visibleBlocks?.length) {
      entries.push(['Blocks', visibleBlocks.map((block, index) => `B${index + 1} {${block.join(', ')}}`).join('  ·  ') ]);
    }
    if (!step && state.result?.cutVertexGraph) {
      const cutEdges = state.result.cutVertexGraph.edges;
      entries.push(['C(G) edges', cutEdges.length
        ? cutEdges.map((edge) => `${edge.from}–${edge.to} (B${edge.blocks.join(', B')})`).join('  ·  ')
        : 'No two cut vertices share a block']);
    }
    if (!entries.length) { panel.hidden = true; return; }
    panel.hidden = false;
    for (const [label, value] of entries) {
      const row = document.createElement('div');
      row.className = 'trace-row';
      const title = document.createElement('span');
      title.className = 'trace-label';
      title.textContent = label;
      const content = document.createElement('span');
      content.className = 'trace-value';
      content.textContent = value;
      row.append(title, content);
      panel.append(row);
    }
  }

  function svgPoint(event) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  function beginDrag(event, node) {
    if (state.connectMode || state.exercise || state.cutGraphView || event.button !== 0) return;
    if (state.result) clearRun();
    event.preventDefault();
    state.dragging = { id: node.id, pointerId: event.pointerId, startX: node.x, startY: node.y, lastX: event.clientX, lastY: event.clientY };
    svg.setPointerCapture(event.pointerId);
  }

  svg.addEventListener('pointermove', (event) => {
    if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - state.dragging.lastX, event.clientY - state.dragging.lastY) > 2) state.dragged = true;
    const point = svgPoint(event);
    const node = state.graph.nodes.find((item) => item.id === state.dragging.id);
    if (!node) return;
    node.x = Math.max(24, Math.min(936, point.x));
    node.y = Math.max(28, Math.min(532, point.y));
    renderGraph();
  });
  svg.addEventListener('pointerup', (event) => {
    if (state.dragging?.pointerId === event.pointerId) {
      state.dragging = null;
      window.setTimeout(() => { state.dragged = false; }, 0);
    }
  });

  function connectNode(id) {
    if (!state.connectStart) {
      state.connectStart = id;
      $('#edit-hint').textContent = `Now choose the second node to connect to ${id}.`;
      return;
    }
    if (id === state.connectStart) {
      $('#edit-hint').textContent = 'Choose a different node to make an edge.';
      return;
    }
    let from = state.connectStart;
    let to = id;
    if (!state.graph.directed && to < from) [from, to] = [to, from];
    const existing = state.graph.edges.find((edge) => edge.from === from && edge.to === to);
    if (existing) {
      setResult(`There is already an edge between ${from} and ${to}.`, 'error');
    } else {
      const weight = $('#weighted-toggle').checked ? Number($('#edge-weight').value) : 1;
      if (!Number.isInteger(weight) || weight < 0 || weight > 999) {
        setResult('Choose a whole-number edge weight from 0 to 999.', 'error');
      } else {
        state.graph.edges.push({ from, to, weight });
        setResult(`Connected ${from} to ${to}${$('#weighted-toggle').checked ? ` with weight ${weight}` : ''}.`);
      }
    }
    state.connectStart = null;
    state.selectedNode = id;
    fillNodeSelects();
    renderGraph();
  }

  function updatePlayback() {
    const steps = state.result?.steps || [];
    const total = steps.length;
    const current = state.stepIndex + 1;
    $('#step-count').textContent = total ? `${current} / ${total}` : 'Ready';
    $('#progress-fill').style.width = total ? `${Math.max(0, current / total) * 100}%` : '0%';
    $('#back-button').disabled = !total || state.stepIndex <= 0;
    $('#next-button').disabled = !total || state.stepIndex >= total - 1;
    $('#reset-button').disabled = !state.result;
    $('#play-button').disabled = !total;
    if (state.result && state.stepIndex === total - 1 && total) stopPlayback();
  }

  function showStep(index) {
    if (!state.result?.steps.length) return;
    state.stepIndex = Math.max(-1, Math.min(index, state.result.steps.length - 1));
    const step = getStep();
    if (step) setResult(step.message);
    renderGraph();
  }

  function requestBody(algorithm) {
    return {
      algorithm,
      directed: state.graph.directed,
      nodes: state.graph.nodes.map(({ id, x, y }) => ({ id, x, y })),
      edges: state.graph.edges.map(({ from, to, weight }) => ({ from, to, weight })),
      start: $('#start-select').value,
      target: $('#target-select').value,
    };
  }

  async function runAlgorithm() {
    stopPlayback();
    state.exercise = null;
    state.cutGraphView = false;
    state.sourceGraph = clone(state.graph);
    $('#view-toggle').hidden = true;
    const algorithm = $('#algorithm-select').value;
    setResult('Running the algorithm…');
    const response = await fetch('/api/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody(algorithm)),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The algorithm could not run.');
    state.result = result;
    state.stepIndex = -1;
    const extra = result.algorithm === 'dijkstra' && result.distance !== null
      ? ` Path: ${result.path.join(' → ')}.` : '';
    setResult(`${result.summary}${extra}`);
    if (result.algorithm === 'articulation') {
      $('#view-toggle').hidden = false;
      $('#view-toggle').textContent = 'Show C(G) →';
      $('#canvas-hint').textContent = 'Lavender nodes are cut vertices in the original graph';
    }
    renderGraph();
  }

  async function checkExercise() {
    stopPlayback();
    setResult('Comparing the graph with its complement…');
    const response = await fetch('/api/exercise/3.4', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody('articulation')),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not check Exercise 3.4.');
    state.exercise = result;
    state.exerciseView = 'original';
    state.cutGraphView = false;
    state.sourceGraph = null;
    $('#view-toggle').hidden = false;
    $('#view-toggle').textContent = 'Show complement →';
    state.graph = { ...result.originalGraph, title: state.sampleTitle };
    state.result = result.originalResult;
    state.stepIndex = -1;
    $('#algorithm-select').value = 'articulation';
    updateControls();
    const original = result.originalResult.articulationPoints;
    const complement = result.complementResult.articulationPoints;
    const statement = result.theoremHolds
      ? `Exercise 3.4 holds for this graph: its cut vertices in G are ${original.length ? original.join(', ') : 'none'}, and the complement has ${complement.length ? `cut vertices ${complement.join(', ')}` : 'no cut vertices'}.`
      : `This graph is a counterexample: ${result.sharedArticulationPoints.join(', ')} are cut vertices in both graphs.`;
    setResult(statement, 'exercise');
    fillNodeSelects();
    $('#directed-toggle').checked = false;
    $('#canvas-hint').textContent = 'Lavender nodes are cut vertices in this graph';
    renderGraph();
  }

  function layoutCutGraph(graph) {
    const nodes = clone(graph.nodes);
    const radiusX = nodes.length > 12 ? 350 : 260;
    const radiusY = nodes.length > 12 ? 205 : 155;
    nodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(nodes.length, 1);
      node.x = 480 + radiusX * Math.cos(angle);
      node.y = 280 + radiusY * Math.sin(angle);
    });
    return { ...clone(graph), nodes, title: 'Cut-vertex graph C(G)', hideWeights: true };
  }

  function toggleGraphView() {
    if (!state.exercise && state.result?.algorithm === 'articulation') {
      if (!state.cutGraphView) {
        state.sourceGraph = clone(state.graph);
        state.graph = layoutCutGraph(state.result.cutVertexGraph);
        state.cutGraphView = true;
        $('#view-toggle').textContent = '← Show original graph';
        $('#canvas-hint').textContent = 'Each node is a cut vertex; an edge means both belong to the same block';
      } else {
        state.graph = clone(state.sourceGraph);
        state.cutGraphView = false;
        $('#view-toggle').textContent = 'Show C(G) →';
        $('#canvas-hint').textContent = 'Lavender nodes are cut vertices in the original graph';
      }
      $('#graph-title').textContent = state.graph.title || state.sampleTitle;
      fillNodeSelects();
      renderGraph();
      return;
    }
    if (!state.exercise) return;
    if (state.exerciseView === 'original') {
      state.exerciseView = 'complement';
      state.graph = { ...state.exercise.complementGraph, title: 'Complement graph  G̅' };
      state.result = state.exercise.complementResult;
      $('#view-toggle').textContent = '← Show original';
      $('#canvas-hint').textContent = 'This graph connects pairs that were not connected in G';
    } else {
      state.exerciseView = 'original';
      state.graph = { ...state.exercise.originalGraph, title: state.sampleTitle };
      state.result = state.exercise.originalResult;
      $('#view-toggle').textContent = 'Show complement →';
      $('#canvas-hint').textContent = 'Lavender nodes are cut vertices in this graph';
    }
    state.stepIndex = -1;
    $('#graph-title').textContent = state.graph.title;
    fillNodeSelects();
    renderGraph();
  }

  function runSafely(action) {
    clearRun();
    action().catch((error) => setResult(error.message, 'error'));
  }

  function addNode() {
    if (state.exercise || state.cutGraphView) return;
    if (state.result) clearRun();
    if (state.graph.nodes.length >= 100) {
      setResult('The editor supports up to 100 nodes.', 'error');
      return;
    }
    let number = 1;
    while (state.graph.nodes.some((node) => node.id === `V${number}`)) number += 1;
    const id = `V${number}`;
    const offset = state.graph.nodes.length % 8;
    state.graph.nodes.push({ id, x: 350 + offset * 28, y: 210 + offset * 22 });
    state.selectedNode = id;
    state.sampleTitle = 'My graph';
    state.graph.title = state.sampleTitle;
    $('#graph-title').textContent = state.sampleTitle;
    $('#sample-description').textContent = 'Custom graph · drag nodes, connect them, and choose an algorithm.';
    fillNodeSelects();
    $('#start-select').value = id;
    setResult(`Added node ${id}.`);
    renderGraph();
  }

  function deleteSelectedNode() {
    if (state.exercise || state.cutGraphView) return;
    if (!state.selectedNode) return;
    if (state.result) clearRun();
    const id = state.selectedNode;
    state.graph.nodes = state.graph.nodes.filter((node) => node.id !== id);
    state.graph.edges = state.graph.edges.filter((edge) => edge.from !== id && edge.to !== id);
    state.selectedNode = state.graph.nodes[0]?.id || null;
    fillNodeSelects();
    setResult(`Deleted ${id} and its connected edges.`);
    renderGraph();
  }

  function init() {
    const select = $('#example-select');
    select.innerHTML = window.GRAPH_EXAMPLES.map((example) =>
      `<option value="${example.id}">${example.difficulty} — ${escapeHtml(example.title)}</option>`).join('');
    select.addEventListener('change', exampleChanged);
    $('#algorithm-select').addEventListener('change', () => { clearRun(); updateControls(); });
    $('#directed-toggle').addEventListener('change', () => {
      state.graph.directed = $('#directed-toggle').checked;
      clearRun();
    });
    $('#weighted-toggle').addEventListener('change', () => {
      if (!$('#weighted-toggle').checked) state.graph.edges.forEach((edge) => { edge.weight = 1; });
      clearRun();
    });
    $('#add-node').addEventListener('click', addNode);
    $('#delete-node').addEventListener('click', deleteSelectedNode);
    $('#connect-mode').addEventListener('click', () => {
      if (state.exercise || state.cutGraphView) return;
      if (state.result) clearRun();
      state.connectMode = !state.connectMode;
      state.connectStart = null;
      $('#connect-mode').classList.toggle('active', state.connectMode);
      $('#edit-hint').textContent = state.connectMode ? 'Connect mode: click two nodes to add an edge.' : 'Drag nodes to move them. Select a node to make it the start.';
    });
    $('#run-button').addEventListener('click', () => runSafely(runAlgorithm));
    $('#exercise-button').addEventListener('click', () => runSafely(checkExercise));
    $('#view-toggle').addEventListener('click', toggleGraphView);
    $('#play-button').addEventListener('click', () => {
      if (!state.result?.steps.length) return;
      if (state.timer) { stopPlayback(); return; }
      if (state.stepIndex >= state.result.steps.length - 1) state.stepIndex = -1;
      $('#play-icon').textContent = 'Ⅱ';
      $('#play-label').textContent = 'Pause';
      state.timer = window.setInterval(() => {
        if (state.stepIndex >= state.result.steps.length - 1) { stopPlayback(); return; }
        showStep(state.stepIndex + 1);
      }, 850);
      showStep(state.stepIndex + 1);
    });
    $('#next-button').addEventListener('click', () => { stopPlayback(); showStep(state.stepIndex + 1); });
    $('#back-button').addEventListener('click', () => { stopPlayback(); showStep(state.stepIndex - 1); });
    $('#reset-button').addEventListener('click', () => { stopPlayback(); state.stepIndex = -1; setResult(state.result?.summary || 'Ready to run.'); renderGraph(); });
    $('#start-select').addEventListener('change', () => { if (state.result) clearRun(); state.selectedNode = $('#start-select').value; renderGraph(); });
    $('#target-select').addEventListener('change', () => { if (state.result) clearRun(); });
    exampleChanged();
  }

  init();
})();
