#include <jni.h>
#include <string>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <csignal>
#include <stdexcept>
#include <exception>
#include <android/log.h>
#include <execinfo.h>
#include <unistd.h>
#include <fcntl.h>
#include "whisper.h"

#define TAG "WhisperJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

#if defined(WHISPER_REAL_INFERENCE_READY)
#define VELLUM_WHISPER_REAL_BUILD 1
#else
#define VELLUM_WHISPER_REAL_BUILD 0
#endif

// ---------------------------------------------------------------------------
// Crash trail + whisper log routing
//
// The transcription runs inside the app process, so a native fault (SIGSEGV /
// SIGABRT from a bad allocation, an escaping C++ exception, or a ggml
// assertion) kills the whole app with no Java stack. These helpers:
//   1. append the faulting signal + native backtrace to the same breadcrumb
//      file the Java worker already uses, so the next launch can show exactly
//      where inference died, and
//   2. forward whisper.cpp's own log stream (device/backend info, compute
//      buffer sizes, error strings) to logcat instead of dropping it.
// ---------------------------------------------------------------------------

static char g_crash_log_path[512] = {0};

struct sigaction g_prev[5];

static void vellum_append_raw(const char * buf, int len) {
    if (g_crash_log_path[0] == 0 || buf == nullptr || len <= 0) return;
    int fd = open(g_crash_log_path, O_WRONLY | O_CREAT | O_APPEND, 0644);
    if (fd < 0) return;
    ssize_t ignored = write(fd, buf, (size_t) len);
    (void) ignored;
    close(fd);
}

static void vellum_signal_handler(int sig, siginfo_t * info, void * ucontext) {
    (void) ucontext;
    char header[192];
    int n = snprintf(header, sizeof(header),
                     "NATIVE_CRASH | signal=%d (%s) addr=%p\n",
                     sig,
                     sig == SIGSEGV ? "SIGSEGV" :
                     sig == SIGABRT ? "SIGABRT" :
                     sig == SIGBUS  ? "SIGBUS"  :
                     sig == SIGILL  ? "SIGILL"  :
                     sig == SIGFPE  ? "SIGFPE"  : "SIG?",
                     info != nullptr ? info->si_addr : nullptr);
    if (n > 0) vellum_append_raw(header, n);

    void * frames[64];
    int count = backtrace(frames, 64);
    if (count > 0 && g_crash_log_path[0] != 0) {
        int fd = open(g_crash_log_path, O_WRONLY | O_CREAT | O_APPEND, 0644);
        if (fd >= 0) {
            backtrace_symbols_fd(frames, count, fd);
            close(fd);
        }
    }

    // Restore the previous disposition (ART installs its own crash handler and
    // needs to run too) and re-raise, so the OS still records a tombstone.
    int idx = -1;
    switch (sig) {
        case SIGSEGV: idx = 0; break;
        case SIGABRT: idx = 1; break;
        case SIGBUS:  idx = 2; break;
        case SIGILL:  idx = 3; break;
        case SIGFPE:  idx = 4; break;
        default: break;
    }
    if (idx >= 0) {
        sigaction(sig, &g_prev[idx], nullptr);
    } else {
        signal(sig, SIG_DFL);
    }
    raise(sig);
}

static void vellum_install_signal_handlers() {
    static const int signals[] = {SIGSEGV, SIGABRT, SIGBUS, SIGILL, SIGFPE};
    for (int i = 0; i < 5; ++i) {
        int sig = signals[i];
        if (sigaction(sig, nullptr, &g_prev[i]) == 0) {
            struct sigaction sa;
            memset(&sa, 0, sizeof(sa));
            sa.sa_sigaction = vellum_signal_handler;
            sa.sa_flags = SA_SIGINFO | SA_ONSTACK;
            sigemptyset(&sa.sa_mask);
            sigaction(sig, &sa, nullptr);
        }
    }
}

#if VELLUM_WHISPER_REAL_BUILD
static void vellum_whisper_log_callback(enum ggml_log_level level, const char * text, void * /*user_data*/) {
    if (text == nullptr) return;
    int prio = ANDROID_LOG_INFO;
    switch (level) {
        case GGML_LOG_LEVEL_DEBUG: prio = ANDROID_LOG_DEBUG; break;
        case GGML_LOG_LEVEL_WARN:  prio = ANDROID_LOG_WARN;  break;
        case GGML_LOG_LEVEL_ERROR: prio = ANDROID_LOG_ERROR; break;
        default: break;
    }
    __android_log_print(prio, "WhisperNative", "%s", text);
}
#endif

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM * /*vm*/, void * /*reserved*/) {
    vellum_install_signal_handlers();
#if VELLUM_WHISPER_REAL_BUILD
    whisper_log_set(vellum_whisper_log_callback, nullptr);
#endif
    LOGI("JNI_OnLoad: crash trail + whisper logging installed (real_build=%d)", VELLUM_WHISPER_REAL_BUILD);
    return JNI_VERSION_1_6;
}

extern "C" {

JNIEXPORT void JNICALL
Java_com_vellumscribe_app_offlineai_whisper_WhisperEngine_nativeSetCrashLogPath(
    JNIEnv * env,
    jclass /* clazz */,
    jstring path
) {
    if (path == nullptr) {
        g_crash_log_path[0] = 0;
        return;
    }
    const char * utf = env->GetStringUTFChars(path, nullptr);
    if (utf != nullptr) {
        strncpy(g_crash_log_path, utf, sizeof(g_crash_log_path) - 1);
        g_crash_log_path[sizeof(g_crash_log_path) - 1] = 0;
        env->ReleaseStringUTFChars(path, utf);
    }
}

JNIEXPORT jlong JNICALL
Java_com_vellumscribe_app_offlineai_whisper_WhisperEngine_nativeInit(
    JNIEnv * env,
    jclass /* clazz */,
    jstring modelPath
) {
    if (modelPath == nullptr) {
        LOGE("nativeInit: modelPath was null");
        return 0;
    }

    const char * nativeModelPath = env->GetStringUTFChars(modelPath, nullptr);
    if (!nativeModelPath) {
        LOGE("nativeInit: Failed to get UTF chars for modelPath");
        return 0;
    }

    LOGI("nativeInit: path=%s real_build=%d", nativeModelPath, VELLUM_WHISPER_REAL_BUILD);
    struct whisper_context * ctx = nullptr;

#if VELLUM_WHISPER_REAL_BUILD
    struct whisper_context_params cparams = whisper_context_default_params();
    // CPU-only build. whisper.cpp 1.9.x defaults `flash_attn` to true, and the
    // encoder/decoder then build a flash-attention graph (ggml_flash_attn_ext)
    // that is a GPU-oriented path; on a pure-CPU device it crashed at the very
    // first inference (right after INFER_BEGIN). Force the well-tested
    // non-flash CPU graphs.
    cparams.use_gpu = false;
    cparams.flash_attn = false;
    // whisper_init_from_file_with_params can throw (it calls whisper_init_state
    // -> whisper_backend_init, which throws std::runtime_error when a backend
    // is missing). An exception crossing this extern "C" boundary terminates
    // the process, so funnel it into the NULL-return failure path.
    try {
        ctx = whisper_init_from_file_with_params(nativeModelPath, cparams);
    } catch (const std::exception & e) {
        LOGE("nativeInit: exception: %s", e.what());
        ctx = nullptr;
    } catch (...) {
        LOGE("nativeInit: unknown exception");
        ctx = nullptr;
    }
#else
    ctx = whisper_init_from_file(nativeModelPath);
#endif

    env->ReleaseStringUTFChars(modelPath, nativeModelPath);

    if (ctx == nullptr) {
        LOGE("nativeInit: Failed to create whisper_context");
        return 0;
    }

    return reinterpret_cast<jlong>(ctx);
}

JNIEXPORT jstring JNICALL
Java_com_vellumscribe_app_offlineai_whisper_WhisperEngine_nativeTranscribe(
    JNIEnv * env,
    jclass /* clazz */,
    jlong contextPtr,
    jfloatArray pcmData,
    jstring language,
    jint nThreads
) {
    auto * ctx = reinterpret_cast<struct whisper_context *>(contextPtr);
    if (ctx == nullptr) {
        LOGE("nativeTranscribe: contextPtr is null");
        return env->NewStringUTF("");
    }

    if (pcmData == nullptr) {
        LOGE("nativeTranscribe: pcmData is null");
        return env->NewStringUTF("");
    }

    jsize sampleCount = env->GetArrayLength(pcmData);
    if (sampleCount <= 0) {
        LOGW("nativeTranscribe: Empty audio buffer");
        return env->NewStringUTF("");
    }

    jfloat * floatBuffer = env->GetFloatArrayElements(pcmData, nullptr);
    if (floatBuffer == nullptr) {
        LOGE("nativeTranscribe: Failed to acquire float array elements");
        return env->NewStringUTF("");
    }

    std::string langStr = "en";
    if (language != nullptr) {
        const char * tmp = env->GetStringUTFChars(language, nullptr);
        if (tmp) {
            langStr = tmp;
            env->ReleaseStringUTFChars(language, tmp);
        }
    }

    int threads = nThreads > 0 ? nThreads : 2;
    if (threads > 4) threads = 4;
    LOGI("nativeTranscribe: samples=%d threads=%d lang=%s real_build=%d",
         sampleCount, threads, langStr.c_str(), VELLUM_WHISPER_REAL_BUILD);

    int ret = 0;

#if VELLUM_WHISPER_REAL_BUILD
    struct whisper_full_params wparams =
        whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    wparams.n_threads = threads;
    wparams.print_progress = false;
    wparams.print_realtime = false;
    wparams.print_timestamps = false;
    wparams.print_special = false;
    wparams.translate = false;
    wparams.no_context = true;
    wparams.single_segment = false;
    // Do NOT set detect_language=true for "auto": whisper_full_with_state then
    // runs language detection and RETURNS 0 before transcribing, so the app
    // gets no text at all. Passing language="auto" with detect_language=false
    // makes whisper detect the language internally and then continue with the
    // full transcription.
    wparams.detect_language = false;
    if (langStr == "auto" || langStr.empty()) {
        wparams.language = "auto";
    } else {
        wparams.language = langStr.c_str();
    }

    // whisper_full allocates several std::vectors and can therefore throw
    // std::bad_alloc (memory pressure) or std::runtime_error. Letting that
    // escape this extern "C" function calls std::terminate -> abort(), which is
    // exactly the "app closed at INFER_BEGIN" symptom. Catch it and report a
    // normal error instead.
    try {
        ret = whisper_full(ctx, wparams, floatBuffer, sampleCount);
    } catch (const std::bad_alloc & e) {
        env->ReleaseFloatArrayElements(pcmData, floatBuffer, JNI_ABORT);
        LOGE("whisper_full: out of memory: %s", e.what());
        jclass exClass = env->FindClass("java/lang/OutOfMemoryError");
        if (exClass != nullptr) {
            env->ThrowNew(exClass,
                "OFFLINE_AI_OUT_OF_MEMORY: not enough free memory for native Whisper inference.");
        }
        return nullptr;
    } catch (const std::exception & e) {
        env->ReleaseFloatArrayElements(pcmData, floatBuffer, JNI_ABORT);
        LOGE("whisper_full: exception: %s", e.what());
        jclass exClass = env->FindClass("java/lang/IllegalStateException");
        if (exClass != nullptr) {
            env->ThrowNew(exClass, e.what());
        }
        return nullptr;
    } catch (...) {
        env->ReleaseFloatArrayElements(pcmData, floatBuffer, JNI_ABORT);
        LOGE("whisper_full: unknown exception");
        jclass exClass = env->FindClass("java/lang/IllegalStateException");
        if (exClass != nullptr) {
            env->ThrowNew(exClass, "OFFLINE_AI_ENGINE_FAILURE: unknown native error.");
        }
        return nullptr;
    }
#else
    ret = whisper_full(ctx, floatBuffer, sampleCount, langStr.c_str(), threads);
#endif

    env->ReleaseFloatArrayElements(pcmData, floatBuffer, JNI_ABORT);

    if (ret != 0) {
        LOGE("whisper_full returned error code %d", ret);
        if (ret == -2) {
            jclass exClass = env->FindClass("java/lang/IllegalStateException");
            if (exClass != nullptr) {
                env->ThrowNew(exClass,
                    "OFFLINE_AI_ENGINE_UNAVAILABLE: Native Whisper tensor execution runtime is not available on this device.");
            }
        }
        return nullptr;
    }

    std::string fullText;
    int n_segments = whisper_full_n_segments(ctx);
    for (int i = 0; i < n_segments; ++i) {
        const char * text = whisper_full_get_segment_text(ctx, i);
        if (text && std::strlen(text) > 0) {
            if (!fullText.empty()) fullText += " ";
            fullText += text;
        }
    }

    return env->NewStringUTF(fullText.c_str());
}

JNIEXPORT void JNICALL
Java_com_vellumscribe_app_offlineai_whisper_WhisperEngine_nativeFree(
    JNIEnv * /* env */,
    jclass /* clazz */,
    jlong contextPtr
) {
    auto * ctx = reinterpret_cast<struct whisper_context *>(contextPtr);
    if (ctx != nullptr) {
#if VELLUM_WHISPER_REAL_BUILD
        // The stub library is compiled with -fno-exceptions, so try/catch is
        // gated on the real build where upstream whisper.cpp can throw.
        try {
            whisper_free(ctx);
        } catch (...) {
            LOGE("nativeFree: exception while freeing context");
        }
#else
        whisper_free(ctx);
#endif
    }
}

JNIEXPORT jboolean JNICALL
Java_com_vellumscribe_app_offlineai_whisper_WhisperEngine_nativeHasTensorRuntime(
    JNIEnv * /* env */,
    jclass /* clazz */
) {
#if VELLUM_WHISPER_REAL_BUILD
    return JNI_TRUE;
#else
    return whisper_has_tensor_runtime() ? JNI_TRUE : JNI_FALSE;
#endif
}

} // extern "C"
