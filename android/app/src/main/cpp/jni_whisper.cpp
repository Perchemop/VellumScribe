#include <jni.h>
#include <string>
#include <vector>
#include <android/log.h>
#include "whisper.h"

#define TAG "WhisperJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

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

    LOGI("nativeInit: Initializing whisper context from path: %s", nativeModelPath);
    struct whisper_context * ctx = whisper_init_from_file(nativeModelPath);
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

    const char * lang = "auto";
    if (language != nullptr) {
        lang = env->GetStringUTFChars(language, nullptr);
    }

    int threads = nThreads > 0 ? nThreads : 4;
    LOGI("nativeTranscribe: Starting inference on %d samples with %d threads, lang=%s",
         sampleCount, threads, lang ? lang : "auto");

    int ret = whisper_full(ctx, floatBuffer, sampleCount, lang, threads);

    if (language != nullptr && lang != nullptr) {
        env->ReleaseStringUTFChars(language, lang);
    }
    env->ReleaseFloatArrayElements(pcmData, floatBuffer, JNI_ABORT);

    if (ret != 0) {
        LOGE("whisper_full returned error code %d", ret);
        return env->NewStringUTF("");
    }

    // Accumulate segment texts
    std::string fullText = "";
    int n_segments = whisper_full_n_segments(ctx);
    for (int i = 0; i < n_segments; ++i) {
        const char * text = whisper_full_get_segment_text(ctx, i);
        if (text && strlen(text) > 0) {
            if (!fullText.empty()) {
                fullText += " ";
            }
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

} // extern "C"
