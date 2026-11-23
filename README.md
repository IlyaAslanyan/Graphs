# Graph Lab

A small graph-algorithm learning app. The backend is written in C++17; the browser interface uses plain HTML, CSS, JavaScript, and SVG so the code stays approachable.

## What it can do

- Run depth-first search (DFS), breadth-first search (BFS), Dijkstra shortest path, and build the cut-vertex graph C(G).
- Step through, play, pause, go backward, or reset an algorithm trace.
- Load ten examples: four small, three medium, and three hard graphs.
- Add, move, connect, and delete nodes. Set directedness and edge weights.
- Check Exercise 3.4 by finding cut vertices in a graph and in its complement, then switch between the two visualizations.
- Inspect the biconnected blocks used to build C(G). Its nodes are only cut vertices, with an edge when two cut vertices share a block.

## Requirements

- CMake 3.20 or newer
- A C++17 compiler
- Internet access on the first configure, so CMake can download pinned versions of the two header-only libraries: `cpp-httplib` v0.67.0 and `nlohmann/json` v3.12.0. CMake verifies their SHA-256 hashes.

## Build and run

From the project folder:

```sh
cmake -S . -B build
cmake --build build
./build/graph_server
```

Open <http://127.0.0.1:8080> in a browser. Stop the server with Ctrl+C. On Windows, run `build/Debug/graph_server.exe` or `build/Release/graph_server.exe`, depending on the generator.

## Algorithms and API

The algorithms live in `src/main.cpp` and use adjacency lists. DFS and BFS return a visit trace with the current stack or queue. Dijkstra returns distance updates and the shortest path. The cut-vertex feature uses a depth-first search edge stack to find biconnected blocks, articulation points, and C(G); it supports undirected graphs.

- `POST /api/run` accepts a JSON graph, algorithm, and start node. Dijkstra also needs a target node. It returns `steps` and the final result. For cut-vertex graph mode it also returns `blocks` and `cutVertexGraph`.
- `POST /api/exercise/3.4` accepts an undirected graph. It returns the articulation points and graph data for both the original and complement graphs, along with whether they share a cut vertex.

The browser plays back the trace returned by C++; it does not reimplement the algorithms.

## Security notes

The server binds only to `127.0.0.1`, limits request bodies to 1 MiB, validates graph sizes and edges, and sends browser security headers. The interface does not load third-party scripts, styles, or fonts. This is a local learning app with no authentication or TLS; do not expose the server directly to a network or deploy it as a public service without adding those protections.
