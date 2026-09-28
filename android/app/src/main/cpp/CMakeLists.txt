cmake_minimum_required(VERSION 3.22.1)
project(whisper_jni LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

# Path to vendored whisper.cpp sources
set(WHISPER_DIR ${CMAKE_SOURCE_DIR}/whisper)

if (EXISTS ${WHISPER_DIR}/whisper.cpp)
    set(WHISPER_SRCS ${WHISPER_DIR}/whisper.cpp)
    set(WHISPER_INCLUDE_DIRS ${WHISPER_DIR})
else()
    set(WHISPER_SRCS whisper.cpp)
    set(WHISPER_INCLUDE_DIRS ${CMAKE_CURRENT_SOURCE_DIR})
endif()

add_library(whisper SHARED
    ${WHISPER_SRCS}
    jni_whisper.cpp
)

target_include_directories(whisper PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${WHISPER_INCLUDE_DIRS}
)

find_library(log-lib log)

target_link_libraries(whisper
    ${log-lib}
    m
)

# Optimize for mobile ARM/NEON size and performance
target_compile_options(whisper PRIVATE
    -O3
    -DNDEBUG
    -fvisibility=hidden
)
