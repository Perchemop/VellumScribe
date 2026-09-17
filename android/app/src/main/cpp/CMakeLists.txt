cmake_minimum_required(VERSION 3.22.1)
project("whisper" LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

# Compiler optimization flags for mobile ARM/NEON and x86_64
if (${ANDROID_ABI} STREQUAL "arm64-v8a")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -fPIC -DWHISPER_USE_ACCELERATE=0")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3 -fPIC")
elseif (${ANDROID_ABI} STREQUAL "armeabi-v7a")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -mfpu=neon -fPIC")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3 -mfpu=neon -fPIC")
else ()
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3 -fPIC")
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3 -fPIC")
endif()

add_library(whisper SHARED
    whisper.cpp
    jni_whisper.cpp
)

target_include_directories(whisper PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

find_library(log-lib log)

target_link_libraries(whisper
    ${log-lib}
    m
)
