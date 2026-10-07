cmake_minimum_required(VERSION 3.22.1)
project(whisper_jni LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)

# -----------------------------------------------------------------------------
# VELLUM_WHISPER_REAL:
#   ON  (default when upstream tree present) — link ggml + upstream whisper.cpp
#   OFF — compile fail-closed stub/ only
# Override: -DVELLUM_WHISPER_REAL=OFF in Gradle externalNativeBuild arguments
# -----------------------------------------------------------------------------

set(WHISPER_UPSTREAM "${CMAKE_SOURCE_DIR}/third_party/whisper.cpp")
set(WHISPER_STUB_DIR "${CMAKE_SOURCE_DIR}/stub")

set(_vellum_upstream_ok FALSE)
if (EXISTS "${WHISPER_UPSTREAM}/src/whisper.cpp" AND EXISTS "${WHISPER_UPSTREAM}/ggml/src/ggml.c")
    set(_vellum_upstream_ok TRUE)
endif()

option(VELLUM_WHISPER_REAL "Build real upstream whisper.cpp + ggml" ${_vellum_upstream_ok})

if (VELLUM_WHISPER_REAL AND NOT _vellum_upstream_ok)
    message(FATAL_ERROR "VELLUM_WHISPER_REAL=ON but third_party/whisper.cpp is incomplete")
endif()

if (VELLUM_WHISPER_REAL)
    message(STATUS "VellumScribe: REAL whisper.cpp + ggml build")

    # Android-friendly ggml defaults (must be set before add_subdirectory)
    set(GGML_NATIVE OFF CACHE BOOL "ggml: disable host-native CPU flags" FORCE)
    set(GGML_OPENMP OFF CACHE BOOL "ggml: OpenMP off on Android" FORCE)
    set(GGML_BACKEND_DL OFF CACHE BOOL "ggml: no dynamic backends" FORCE)
    set(GGML_STATIC ON CACHE BOOL "ggml: static" FORCE)
    set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
    set(GGML_CUDA OFF CACHE BOOL "" FORCE)
    set(GGML_METAL OFF CACHE BOOL "" FORCE)
    set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
    set(GGML_BLAS OFF CACHE BOOL "" FORCE)
    set(GGML_RPC OFF CACHE BOOL "" FORCE)

    add_subdirectory("${WHISPER_UPSTREAM}/ggml" "${CMAKE_BINARY_DIR}/ggml-build")

    # Match upstream src/CMakeLists.txt library sources (whisper + aneforge).
    set(_whisper_sources
        "${WHISPER_UPSTREAM}/src/whisper.cpp"
        jni_whisper.cpp
    )
    if (EXISTS "${WHISPER_UPSTREAM}/src/aneforge/whisper-aneforge.cpp")
        list(APPEND _whisper_sources "${WHISPER_UPSTREAM}/src/aneforge/whisper-aneforge.cpp")
        message(STATUS "VellumScribe: including whisper-aneforge.cpp")
    else()
        message(WARNING "VellumScribe: aneforge source missing — link may fail")
    endif()

    add_library(whisper SHARED ${_whisper_sources})

    target_include_directories(whisper PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}"
        "${WHISPER_UPSTREAM}/include"
        "${WHISPER_UPSTREAM}/src"
        "${WHISPER_UPSTREAM}/src/aneforge"
        "${WHISPER_UPSTREAM}/ggml/include"
        "${WHISPER_UPSTREAM}/ggml/src"
        "${WHISPER_UPSTREAM}/ggml/src/ggml-cpu"
    )

    # Upstream whisper.cpp uses try/throw and reports version via WHISPER_VERSION.
    target_compile_definitions(whisper PRIVATE
        WHISPER_REAL_INFERENCE_READY=1
        GGML_USE_CPU=1
        WHISPER_VERSION="1.9.4"
    )

    find_library(log-lib log)
    find_library(android-lib android)

    target_link_libraries(whisper
        ${log-lib}
        ${android-lib}
        ggml
        m
    )

    # REAL build requires C++ exceptions (upstream throw/try paths).
    target_compile_options(whisper PRIVATE
        -O3
        -DNDEBUG
        -fvisibility=hidden
        -fexceptions
        -frtti
    )
else()
    message(STATUS "VellumScribe: STUB libwhisper.so (inferenceRuntimeReady=false)")

    add_library(whisper SHARED
        "${WHISPER_STUB_DIR}/whisper.cpp"
        jni_whisper.cpp
    )

    target_include_directories(whisper PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}"
        "${WHISPER_STUB_DIR}"
    )

    find_library(log-lib log)
    target_link_libraries(whisper ${log-lib} m)

    target_compile_options(whisper PRIVATE
        -O3
        -DNDEBUG
        -fvisibility=hidden
        -fno-exceptions
        -fno-rtti
    )
endif()
