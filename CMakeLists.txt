cmake_minimum_required(VERSION 3.20)
project(graph_algorithm_visualizer LANGUAGES CXX)

if (POLICY CMP0135)
    cmake_policy(SET CMP0135 NEW)
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)

FetchContent_Declare(
    nlohmann_json
    URL https://github.com/nlohmann/json/releases/download/v3.12.0/json.tar.xz
    URL_HASH SHA256=42f6e95cad6ec532fd372391373363b62a14af6d771056dbfc86160e6dfff7aa
)
FetchContent_Declare(
    cpp_httplib
    URL https://github.com/yhirose/cpp-httplib/archive/refs/tags/v0.67.0.tar.gz
    URL_HASH SHA256=be711ddaf7a3655d8f23aa5655709250b24d247aedd4b2629989d18b6164e5be
)
set(HTTPLIB_INSTALL OFF CACHE BOOL "" FORCE)
set(HTTPLIB_COMPILE OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(nlohmann_json cpp_httplib)

add_executable(graph_server src/main.cpp)
target_link_libraries(graph_server PRIVATE nlohmann_json::nlohmann_json httplib)
target_compile_definitions(graph_server PRIVATE GRAPH_WEB_DIR="${CMAKE_CURRENT_SOURCE_DIR}/web")

if (WIN32)
    target_link_libraries(graph_server PRIVATE ws2_32)
else()
    find_package(Threads REQUIRED)
    target_link_libraries(graph_server PRIVATE Threads::Threads)
endif()
