#include <algorithm>
#include <functional>
#include <iostream>
#include <map>
#include <queue>
#include <set>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

#include "httplib.h"
#include "nlohmann/json.hpp"

using json = nlohmann::json;

namespace {

struct Edge {
    std::string to;
    int weight;
};

using Graph = std::unordered_map<std::string, std::vector<Edge>>;

std::vector<std::string> sortedIds(const std::set<std::string>& values) {
    return {values.begin(), values.end()};
}

json makeStep(const std::string& current,
              const std::set<std::string>& visited,
              const std::vector<std::string>& frontier,
              const std::string& message,
              const std::string& event = "visit",
              const std::string& edgeFrom = "",
              const std::string& edgeTo = "",
              const std::map<std::string, long long>& distances = {}) {
    json step = {
        {"event", event},
        {"current", current},
        {"visited", sortedIds(visited)},
        {"frontier", frontier},
        {"message", message},
        {"distances", distances}
    };
    if (!edgeFrom.empty() && !edgeTo.empty()) {
        step["activeEdge"] = {{"from", edgeFrom}, {"to", edgeTo}};
    } else {
        step["activeEdge"] = nullptr;
    }
    return step;
}

std::vector<std::string> frontierFromQueue(std::queue<std::string> pending) {
    std::vector<std::string> values;
    while (!pending.empty()) {
        values.push_back(pending.front());
        pending.pop();
    }
    return values;
}

std::vector<std::string> frontierFromStack(std::vector<std::string> pending) {
    std::reverse(pending.begin(), pending.end());
    return pending;
}

json runTraversal(const Graph& graph, const std::string& algorithm, const std::string& start) {
    json steps = json::array();
    std::set<std::string> visited;
    std::vector<std::string> order;

    if (algorithm == "bfs") {
        std::queue<std::string> pending;
        pending.push(start);
        std::set<std::string> discovered{start};

        while (!pending.empty()) {
            const std::string current = pending.front();
            pending.pop();
            visited.insert(current);
            order.push_back(current);

            for (const Edge& edge : graph.at(current)) {
                if (discovered.insert(edge.to).second) {
                    pending.push(edge.to);
                }
            }
            steps.push_back(makeStep(current, visited, frontierFromQueue(pending),
                                     "Visited " + current + ". Added its new neighbors to the queue."));
        }
    } else {
        std::vector<std::string> pending{start};

        while (!pending.empty()) {
            const std::string current = pending.back();
            pending.pop_back();
            if (visited.count(current)) continue;
            visited.insert(current);
            order.push_back(current);

            const auto& neighbors = graph.at(current);
            for (auto it = neighbors.rbegin(); it != neighbors.rend(); ++it) {
                if (!visited.count(it->to)) {
                    pending.push_back(it->to);
                }
            }
            steps.push_back(makeStep(current, visited, frontierFromStack(pending),
                                     "Visited " + current + ". Added its new neighbors to the stack."));
        }
    }

    return {
        {"algorithm", algorithm},
        {"visitedOrder", order},
        {"steps", steps},
        {"path", json::array()},
        {"distance", nullptr},
        {"summary", "Visited " + std::to_string(order.size()) + " reachable node(s) from " + start + "."}
    };
}

json runDijkstra(const Graph& graph, const std::string& start, const std::string& target) {
    const long long infinity = (1LL << 60);
    std::map<std::string, long long> distances;
    std::map<std::string, std::string> previous;
    for (const auto& entry : graph) {
        distances[entry.first] = infinity;
    }
    distances[start] = 0;

    using QueueItem = std::pair<long long, std::string>;
    std::priority_queue<QueueItem, std::vector<QueueItem>, std::greater<QueueItem>> pending;
    pending.push({0, start});
    std::set<std::string> visited;
    json steps = json::array();
    std::vector<std::string> order;

    while (!pending.empty()) {
        const auto [distance, current] = pending.top();
        pending.pop();
        if (distance != distances[current] || visited.count(current)) {
            continue;
        }

        visited.insert(current);
        order.push_back(current);
        steps.push_back(makeStep(current, visited, {},
                                 "Selected " + current + " with distance " + std::to_string(distance) + ".",
                                 "visit", "", "", distances));

        if (current == target) {
            break;
        }

        for (const Edge& edge : graph.at(current)) {
            if (distance + edge.weight < distances[edge.to]) {
                distances[edge.to] = distance + edge.weight;
                previous[edge.to] = current;
                pending.push({distances[edge.to], edge.to});
                steps.push_back(makeStep(current, visited, {},
                                         "Updated " + edge.to + " to distance " +
                                             std::to_string(distances[edge.to]) + ".",
                                         "relax", current, edge.to, distances));
            }
        }
    }

    json path = json::array();
    json finalDistance = nullptr;
    std::string summary = "There is no path from " + start + " to " + target + ".";
    if (distances[target] != infinity) {
        std::vector<std::string> reversedPath;
        std::string node = target;
        reversedPath.push_back(node);
        while (node != start) {
            const auto it = previous.find(node);
            if (it == previous.end()) {
                throw std::runtime_error("Could not rebuild the shortest path.");
            }
            node = it->second;
            reversedPath.push_back(node);
        }
        std::reverse(reversedPath.begin(), reversedPath.end());
        path = reversedPath;
        finalDistance = distances[target];
        summary = "Shortest path distance: " + std::to_string(distances[target]) + ".";
    }

    for (auto& step : steps) {
        for (auto it = step["distances"].begin(); it != step["distances"].end(); ++it) {
            if (it.value() == infinity) {
                it.value() = nullptr;
            }
        }
    }
    json visibleDistances = distances;
    for (auto it = visibleDistances.begin(); it != visibleDistances.end(); ++it) {
        if (it.value() == infinity) {
            it.value() = nullptr;
        }
    }

    return {
        {"algorithm", "dijkstra"},
        {"visitedOrder", order},
        {"steps", steps},
        {"path", path},
        {"distance", finalDistance},
        {"distances", visibleDistances},
        {"summary", summary}
    };
}

json runArticulationPoints(const Graph& graph) {
    // Tarjan's edge stack splits an undirected graph into maximal blocks.
    // The final C(G) keeps only cut vertices and links each pair that shares a block.
    std::map<std::string, int> discovery;
    std::map<std::string, int> low;
    std::set<std::string> visited;
    std::set<std::string> cutPoints;
    std::vector<std::string> visitOrder;
    std::vector<std::pair<std::string, std::string>> edgeStack;
    std::vector<std::vector<std::string>> blocks;
    json steps = json::array();
    int clock = 0;

    auto blockSnapshot = [&]() {
        json value = json::array();
        for (const auto& block : blocks) value.push_back(block);
        return value;
    };

    auto saveBlockUntil = [&](const std::string& from, const std::string& to) {
        std::set<std::string> members;
        while (!edgeStack.empty()) {
            const auto edge = edgeStack.back();
            edgeStack.pop_back();
            members.insert(edge.first);
            members.insert(edge.second);
            if (edge.first == from && edge.second == to) break;
        }
        if (!members.empty()) {
            blocks.push_back(sortedIds(members));
            steps.push_back({
                {"event", "block"}, {"current", from}, {"visited", sortedIds(visited)},
                {"activeEdge", {{"from", from}, {"to", to}}},
                {"discovery", discovery}, {"low", low},
                {"articulationPoints", sortedIds(cutPoints)}, {"blocks", blockSnapshot()},
                {"message", "Found block " + std::to_string(blocks.size()) + "."}
            });
        }
    };

    std::function<void(const std::string&, const std::string&)> visit =
        [&](const std::string& current, const std::string& parent) {
            discovery[current] = low[current] = ++clock;
            visited.insert(current);
            visitOrder.push_back(current);
            steps.push_back({
                {"event", "visit"}, {"current", current}, {"visited", sortedIds(visited)},
                {"activeEdge", nullptr}, {"discovery", discovery}, {"low", low},
                {"articulationPoints", sortedIds(cutPoints)}, {"blocks", blockSnapshot()},
                {"message", "Enter " + current + " (discovery time " + std::to_string(clock) + ")."}
            });

            int children = 0;
            for (const Edge& edge : graph.at(current)) {
                if (!discovery.count(edge.to)) {
                    ++children;
                    edgeStack.push_back({current, edge.to});
                    visit(edge.to, current);
                    low[current] = std::min(low[current], low[edge.to]);

                    if (low[edge.to] >= discovery[current]) {
                        if (!parent.empty() || children > 1) {
                            cutPoints.insert(current);
                        }
                        saveBlockUntil(current, edge.to);
                    }
                    steps.push_back({
                        {"event", "return"}, {"current", current}, {"visited", sortedIds(visited)},
                        {"activeEdge", {{"from", current}, {"to", edge.to}}},
                        {"discovery", discovery}, {"low", low},
                        {"articulationPoints", sortedIds(cutPoints)}, {"blocks", blockSnapshot()},
                        {"message", "Return from " + edge.to + ": low(" + current + ") = " +
                                        std::to_string(low[current]) + "."}
                    });
                } else if (edge.to != parent && discovery[edge.to] < discovery[current]) {
                    edgeStack.push_back({current, edge.to});
                    low[current] = std::min(low[current], discovery[edge.to]);
                    steps.push_back({
                        {"event", "back-edge"}, {"current", current}, {"visited", sortedIds(visited)},
                        {"activeEdge", {{"from", current}, {"to", edge.to}}},
                        {"discovery", discovery}, {"low", low},
                        {"articulationPoints", sortedIds(cutPoints)}, {"blocks", blockSnapshot()},
                        {"message", "Back edge to " + edge.to + ": low(" + current + ") = " +
                                        std::to_string(low[current]) + "."}
                    });
                }
            }

            if (parent.empty()) {
                steps.push_back({
                    {"event", "root-check"}, {"current", current}, {"visited", sortedIds(visited)},
                    {"activeEdge", nullptr}, {"discovery", discovery}, {"low", low},
                    {"articulationPoints", sortedIds(cutPoints)}, {"blocks", blockSnapshot()},
                    {"message", "Root " + current + (children > 1 ? " has multiple DFS children and is a cut vertex." :
                                                                  " has at most one DFS child, so it is not a cut vertex.")}
                });
            }
        };

    std::vector<std::string> nodeIds;
    nodeIds.reserve(graph.size());
    for (const auto& node : graph) nodeIds.push_back(node.first);
    std::sort(nodeIds.begin(), nodeIds.end());
    for (const std::string& node : nodeIds) {
        if (!discovery.count(node)) {
            if (graph.at(node).empty()) {
                discovery[node] = low[node] = ++clock;
                visited.insert(node);
                visitOrder.push_back(node);
                blocks.push_back({node});
                steps.push_back({
                    {"event", "block"}, {"current", node}, {"visited", sortedIds(visited)},
                    {"activeEdge", nullptr}, {"discovery", discovery}, {"low", low},
                    {"articulationPoints", sortedIds(cutPoints)}, {"blocks", blockSnapshot()},
                    {"message", "Isolated node " + node + " forms a single-node block."}
                });
            } else {
                visit(node, "");
            }
        }
    }

    const std::vector<std::string> points = sortedIds(cutPoints);
    std::map<std::pair<std::string, std::string>, std::vector<int>> sharedBlocks;
    for (std::size_t index = 0; index < blocks.size(); ++index) {
        std::vector<std::string> cutMembers;
        for (const std::string& member : blocks[index]) {
            if (cutPoints.count(member)) cutMembers.push_back(member);
        }
        for (std::size_t left = 0; left < cutMembers.size(); ++left) {
            for (std::size_t right = left + 1; right < cutMembers.size(); ++right) {
                sharedBlocks[{cutMembers[left], cutMembers[right]}].push_back(static_cast<int>(index + 1));
            }
        }
    }

    json cutGraphNodes = json::array();
    for (const std::string& point : points) cutGraphNodes.push_back({{"id", point}});
    json cutGraphEdges = json::array();
    for (const auto& entry : sharedBlocks) {
        cutGraphEdges.push_back({
            {"from", entry.first.first}, {"to", entry.first.second},
            {"weight", 1}, {"blocks", entry.second}
        });
    }
    json serializedBlocks = blockSnapshot();
    std::string pointList;
    for (const auto& point : points) {
        if (!pointList.empty()) pointList += ", ";
        pointList += point;
    }
    const std::string summary = points.empty()
        ? "Found " + std::to_string(blocks.size()) + " block(s) and no cut vertices; C(G) has no nodes."
        : "Found " + std::to_string(points.size()) + " cut vertex/vertices (" + pointList + "), " +
              std::to_string(blocks.size()) + " block(s), and " + std::to_string(cutGraphEdges.size()) + " edge(s) in C(G).";

    return {
        {"algorithm", "articulation"},
        {"visitedOrder", visitOrder},
        {"steps", steps},
        {"articulationPoints", points},
        {"blocks", serializedBlocks},
        {"cutVertexGraph", {{"nodes", cutGraphNodes}, {"edges", cutGraphEdges}, {"directed", false}}},
        {"path", json::array()},
        {"distance", nullptr},
        {"summary", summary}
    };
}

json runAlgorithm(const json& request) {
    if (!request.is_object()) {
        throw std::invalid_argument("Request body must be a JSON object.");
    }
    const std::string algorithm = request.value("algorithm", "");
    if (algorithm != "dfs" && algorithm != "bfs" && algorithm != "dijkstra" && algorithm != "articulation") {
        throw std::invalid_argument("Choose DFS, BFS, Dijkstra, or cut vertices.");
    }
    if (!request.contains("nodes") || !request["nodes"].is_array() || request["nodes"].empty()) {
        throw std::invalid_argument("Add at least one node to the graph.");
    }
    if (!request.contains("edges") || !request["edges"].is_array()) {
        throw std::invalid_argument("Graph edges must be an array.");
    }
    if (request["nodes"].size() > 100) {
        throw std::invalid_argument("The editor supports up to 100 nodes.");
    }
    if (request["edges"].size() > 5000) {
        throw std::invalid_argument("The editor supports up to 5000 edges.");
    }

    Graph graph;
    for (const auto& node : request["nodes"]) {
        if (!node.is_object() || !node.contains("id") || !node["id"].is_string()) {
            throw std::invalid_argument("Each node needs a text id.");
        }
        const std::string id = node["id"].get<std::string>();
        if (id.empty() || id.size() > 24) {
            throw std::invalid_argument("Node ids must have 1 to 24 characters.");
        }
        if (!graph.emplace(id, std::vector<Edge>{}).second) {
            throw std::invalid_argument("Node ids must be unique.");
        }
    }

    const bool directed = request.value("directed", false);
    if (algorithm == "articulation" && directed) {
        throw std::invalid_argument("Cut vertices are defined here for undirected graphs. Turn off Directed.");
    }
    std::set<std::pair<std::string, std::string>> seenEdges;
    for (const auto& edge : request["edges"]) {
        if (!edge.is_object() || !edge.contains("from") || !edge.contains("to") ||
            !edge["from"].is_string() || !edge["to"].is_string()) {
            throw std::invalid_argument("Each edge needs a from and to node id.");
        }
        const std::string from = edge["from"].get<std::string>();
        const std::string to = edge["to"].get<std::string>();
        if (from == to) {
            throw std::invalid_argument("Self-loops are not supported in this graph editor.");
        }
        if (!graph.count(from) || !graph.count(to)) {
            throw std::invalid_argument("Every edge must connect existing nodes.");
        }
        std::string edgeFrom = from;
        std::string edgeTo = to;
        if (!directed && edgeTo < edgeFrom) std::swap(edgeFrom, edgeTo);
        if (!seenEdges.insert({edgeFrom, edgeTo}).second) {
            throw std::invalid_argument("Duplicate edges are not supported.");
        }
        int weight = 1;
        if (edge.contains("weight")) {
            if (!edge["weight"].is_number_integer()) {
                throw std::invalid_argument("Edge weights must be whole numbers.");
            }
            weight = edge["weight"].get<int>();
        }
        if (weight < 0 || weight > 999) {
            throw std::invalid_argument("Edge weights must be between 0 and 999.");
        }
        graph[from].push_back({to, weight});
        if (!directed) {
            graph[to].push_back({from, weight});
        }
    }
    for (auto& entry : graph) {
        std::sort(entry.second.begin(), entry.second.end(), [](const Edge& left, const Edge& right) {
            return left.to < right.to;
        });
    }

    const std::string start = request.value("start", "");
    if (!graph.count(start)) {
        throw std::invalid_argument("Choose a start node that exists in the graph.");
    }
    if (algorithm == "dijkstra") {
        const std::string target = request.value("target", "");
        if (!graph.count(target)) {
            throw std::invalid_argument("Choose a target node that exists in the graph.");
        }
        return runDijkstra(graph, start, target);
    }
    if (algorithm == "articulation") {
        return runArticulationPoints(graph);
    }
    return runTraversal(graph, algorithm, start);
}

json checkExercise34(const json& request) {
    if (request.value("directed", false)) {
        throw std::invalid_argument("Exercise 3.4 uses an undirected graph. Turn off Directed first.");
    }
    json originalRequest = request;
    originalRequest["algorithm"] = "articulation";
    json originalResult = runAlgorithm(originalRequest);

    if (!request.contains("nodes") || !request["nodes"].is_array()) {
        throw std::invalid_argument("Add nodes before checking Exercise 3.4.");
    }
    std::set<std::pair<std::string, std::string>> existing;
    if (request.contains("edges") && request["edges"].is_array()) {
        for (const auto& edge : request["edges"]) {
            if (edge.contains("from") && edge.contains("to") && edge["from"].is_string() && edge["to"].is_string()) {
                std::string from = edge["from"].get<std::string>();
                std::string to = edge["to"].get<std::string>();
                if (to < from) std::swap(from, to);
                existing.insert({from, to});
            }
        }
    }
    json complementEdges = json::array();
    const auto& nodes = request["nodes"];
    for (std::size_t i = 0; i < nodes.size(); ++i) {
        const std::string from = nodes[i]["id"].get<std::string>();
        for (std::size_t j = i + 1; j < nodes.size(); ++j) {
            const std::string to = nodes[j]["id"].get<std::string>();
            std::string left = from, right = to;
            if (right < left) std::swap(left, right);
            if (!existing.count({left, right})) {
                complementEdges.push_back({{"from", from}, {"to", to}, {"weight", 1}});
            }
        }
    }

    json complementRequest = request;
    complementRequest["algorithm"] = "articulation";
    complementRequest["directed"] = false;
    complementRequest["edges"] = complementEdges;
    json complementResult = runAlgorithm(complementRequest);
    std::set<std::string> complementPoints;
    for (const auto& point : complementResult["articulationPoints"]) {
        complementPoints.insert(point.get<std::string>());
    }
    std::vector<std::string> sharedPoints;
    for (const auto& point : originalResult["articulationPoints"]) {
        const std::string id = point.get<std::string>();
        if (complementPoints.count(id)) sharedPoints.push_back(id);
    }

    return {
        {"originalGraph", {{"nodes", request["nodes"]}, {"edges", request["edges"]}, {"directed", false}}},
        {"complementGraph", {{"nodes", request["nodes"]}, {"edges", complementEdges}, {"directed", false}}},
        {"originalResult", originalResult},
        {"complementResult", complementResult},
        {"theoremHolds", sharedPoints.empty()},
        {"sharedArticulationPoints", sharedPoints}
    };
}

}  // namespace

int main() {
    httplib::Server server;
    server.set_payload_max_length(1024 * 1024);
    server.set_read_timeout(10, 0);
    server.set_write_timeout(10, 0);
    server.set_default_headers({
        {"X-Content-Type-Options", "nosniff"},
        {"X-Frame-Options", "DENY"},
        {"Referrer-Policy", "no-referrer"},
        {"Permissions-Policy", "camera=(), microphone=(), geolocation=()"},
        {"Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}
    });
    server.set_mount_point("/", GRAPH_WEB_DIR);

    server.Post("/api/run", [](const httplib::Request& request, httplib::Response& response) {
        try {
            const json body = json::parse(request.body);
            response.set_content(runAlgorithm(body).dump(), "application/json; charset=utf-8");
        } catch (const std::invalid_argument& error) {
            response.status = 400;
            response.set_content(json{{"error", error.what()}}.dump(), "application/json; charset=utf-8");
        } catch (const json::exception& error) {
            response.status = 400;
            response.set_content(json{{"error", std::string("Invalid request: ") + error.what()}}.dump(),
                                  "application/json; charset=utf-8");
        } catch (const std::exception& error) {
            response.status = 500;
            response.set_content(json{{"error", error.what()}}.dump(), "application/json; charset=utf-8");
        }
    });

    server.Post("/api/exercise/3.4", [](const httplib::Request& request, httplib::Response& response) {
        try {
            const json body = json::parse(request.body);
            response.set_content(checkExercise34(body).dump(), "application/json; charset=utf-8");
        } catch (const std::invalid_argument& error) {
            response.status = 400;
            response.set_content(json{{"error", error.what()}}.dump(), "application/json; charset=utf-8");
        } catch (const json::exception& error) {
            response.status = 400;
            response.set_content(json{{"error", std::string("Invalid request: ") + error.what()}}.dump(),
                                  "application/json; charset=utf-8");
        } catch (const std::exception& error) {
            response.status = 500;
            response.set_content(json{{"error", error.what()}}.dump(), "application/json; charset=utf-8");
        }
    });

    const char* host = "127.0.0.1";
    const int port = 8080;
    std::cout << "Graph Visualizer is ready at http://" << host << ":" << port << std::endl;
    if (!server.listen(host, port)) {
        std::cerr << "Could not start the server on port " << port << "." << std::endl;
        return 1;
    }
    return 0;
}
