#include <jni.h>
#include <string>
#include <cstring>
#include <android/log.h>
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

extern "C" {

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
    cparams.use_gpu = false;
    ctx = whisper_init_from_file_with_params(nativeModelPath, cparams);
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

    int threads = nThreads > 0 ? nThreads : 4;
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
    if (langStr == "auto" || langStr.empty()) {
        wparams.language = "auto";
        wparams.detect_language = true;
    } else {
        wparams.language = langStr.c_str();
        wparams.detect_language = false;
    }
    ret = whisper_full(ctx, wparams, floatBuffer, sampleCount);
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
        whisper_free(ctx);
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
