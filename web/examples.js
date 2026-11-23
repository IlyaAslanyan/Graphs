(() => {
  function makeExample({ id, title, difficulty, count, directed, weighted, extraEdges, seed, description, closed = true }) {
    const columns = Math.ceil(Math.sqrt(count * 1.6));
    const rows = Math.ceil(count / columns);
    const nodes = Array.from({ length: count }, (_, index) => ({
      id: `V${index + 1}`,
      x: 54 + (index % columns) * (852 / Math.max(1, columns - 1)),
      y: 62 + Math.floor(index / columns) * (430 / Math.max(1, rows - 1)),
    }));

    const edges = [];
    const used = new Set();
    const addEdge = (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return false;
      let from = fromIndex;
      let to = toIndex;
      if (!directed && to < from) [from, to] = [to, from];
      const key = `${from}:${to}`;
      if (used.has(key)) return false;
      used.add(key);
      const weight = weighted ? 1 + ((from * 7 + to * 3 + seed) % 9) : 1;
      edges.push({ from: nodes[from].id, to: nodes[to].id, weight });
      return true;
    };

    // A ring keeps every example connected; extra links add alternate routes.
    for (let i = 0; i < count - (closed ? 0 : 1); i += 1) addEdge(i, (i + 1) % count);
    let added = 0;
    for (let step = 0; added < extraEdges && step < count * count * 2; step += 1) {
      const from = (step * seed + Math.floor(step / count) + seed) % count;
      const jump = 2 + ((step * 5 + seed) % Math.max(1, count - 2));
      const to = (from + jump) % count;
      if (addEdge(from, to)) added += 1;
    }

    return { id, title, difficulty, description, nodes, edges, directed, weighted };
  }

  const specifications = [
    { id: 'small-path', title: 'A path through the park', difficulty: 'Small · 8 nodes', count: 8, directed: false, weighted: false, extraEdges: 0, seed: 2, description: 'A simple chain: a good first graph for seeing a cut vertex.', closed: false },
    { id: 'small-loop', title: 'Round trip', difficulty: 'Small · 10 nodes', count: 10, directed: false, weighted: true, extraEdges: 5, seed: 3, description: 'A weighted, undirected network with a few alternate routes.' },
    { id: 'small-oneway', title: 'One-way streets', difficulty: 'Small · 12 nodes', count: 12, directed: true, weighted: false, extraEdges: 6, seed: 5, description: 'Follow directed connections to compare a queue and a stack.' },
    { id: 'small-bridge', title: 'Two neighborhoods', difficulty: 'Small · 9 nodes', count: 9, directed: false, weighted: false, extraEdges: 2, seed: 7, description: 'A connected graph with a narrow link between parts.' },
    { id: 'medium-routes', title: 'Regional routes', difficulty: 'Medium · 20 nodes', count: 20, directed: false, weighted: true, extraEdges: 13, seed: 4, description: 'Compare shortest routes across a larger weighted network.' },
    { id: 'medium-dependencies', title: 'Task dependencies', difficulty: 'Medium · 24 nodes', count: 24, directed: true, weighted: false, extraEdges: 16, seed: 6, description: 'A directed network for tracing reachability.' },
    { id: 'medium-forest', title: 'The branching forest', difficulty: 'Medium · 30 nodes', count: 30, directed: false, weighted: false, extraEdges: 8, seed: 9, description: 'A sparse network with branches and alternate connections.' },
    { id: 'hard-transit', title: 'Metro connections', difficulty: 'Hard · 40 nodes', count: 40, directed: false, weighted: true, extraEdges: 34, seed: 11, description: 'Many routes and weights make shortest-path choices less obvious.' },
    { id: 'hard-web', title: 'Web of links', difficulty: 'Hard · 50 nodes', count: 50, directed: true, weighted: false, extraEdges: 41, seed: 13, description: 'A dense directed graph with many choices at each step.' },
    { id: 'hard-network', title: 'Large network', difficulty: 'Hard · 60 nodes', count: 60, directed: false, weighted: true, extraEdges: 50, seed: 17, description: 'The largest example: inspect the trace one step at a time.' },
  ];

  window.GRAPH_EXAMPLES = specifications.map(makeExample);
})();
