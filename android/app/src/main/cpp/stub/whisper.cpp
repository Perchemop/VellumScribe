#include "whisper.h"
#include <string>
#include <vector>
#include <fstream>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <sstream>
#include <new>
#include <android/log.h>

#define TAG "WhisperNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

struct whisper_segment {
    int64_t t0;
    int64_t t1;
    std::string text;
};

struct whisper_context {
    std::string model_path;
    whisper_model_hparams hparams;
    bool is_loaded;
    std::vector<whisper_segment> segments;
    std::vector<std::string> vocab;
    std::vector<float> mel_filters;
};

static constexpr int WHISPER_SAMPLE_RATE = 16000;

struct whisper_context * whisper_init_from_file(const char * path_model) {
    if (!path_model) {
        LOGE("whisper_init_from_file: null path provided");
        return nullptr;
    }

    std::ifstream file(path_model, std::ios::binary);
    if (!file.is_open()) {
        LOGE("Failed to open model file: %s", path_model);
        return nullptr;
    }

    uint32_t magic = 0;
    file.read(reinterpret_cast<char *>(&magic), sizeof(magic));
    if (!file.good()) {
        LOGE("Failed to read magic bytes from %s", path_model);
        return nullptr;
    }

    auto * ctx = new (std::nothrow) whisper_context();
    if (!ctx) {
        LOGE("Out of memory allocating whisper_context");
        return nullptr;
    }
    ctx->model_path = path_model;
    ctx->is_loaded = false;

    if (magic == GGML_FILE_MAGIC || magic == 0x67676d66 || magic == 0x67676d6c || magic == 0x676d6c75) {
        LOGI("Valid GGML magic header found: 0x%08x", magic);
    } else {
        LOGW("Model magic 0x%08x is non-standard GGML, proceeding...", magic);
    }

    whisper_model_hparams hp;
    file.read(reinterpret_cast<char *>(&hp), sizeof(hp));

    if (file.good() && hp.n_vocab > 0 && hp.n_vocab < 200000 && hp.n_mels > 0 && hp.n_mels <= 128) {
        ctx->hparams = hp;
        LOGI("Loaded hparams: n_vocab=%d n_mels=%d", hp.n_vocab, hp.n_mels);
    } else {
        ctx->hparams.n_vocab = 51865;
        ctx->hparams.n_audio_ctx = 1500;
        ctx->hparams.n_audio_state = 384;
        ctx->hparams.n_audio_head = 6;
        ctx->hparams.n_audio_layer = 4;
        ctx->hparams.n_text_ctx = 448;
        ctx->hparams.n_text_state = 384;
        ctx->hparams.n_text_head = 6;
        ctx->hparams.n_text_layer = 4;
        ctx->hparams.n_mels = 80;
        ctx->hparams.f16 = 1;
        LOGI("Applying standard Whisper hparams");
    }

    // No try/catch — CMake uses -fno-exceptions
    ctx->vocab.reserve(static_cast<size_t>(ctx->hparams.n_vocab));
    for (int i = 0; i < ctx->hparams.n_vocab && file.good(); ++i) {
        uint32_t len = 0;
        file.read(reinterpret_cast<char *>(&len), sizeof(len));
        if (!file.good() || len > 256) break;
        std::string word(len, '\0');
        file.read(&word[0], static_cast<std::streamsize>(len));
        if (file.good()) ctx->vocab.push_back(word);
        else break;
    }
    LOGI("Read %zu vocab tokens", ctx->vocab.size());

    ctx->is_loaded = true;
    LOGI("Initialized Whisper context for: %s", path_model);
    return ctx;
}

void whisper_free(struct whisper_context * ctx) {
    if (ctx) {
        LOGI("Freeing whisper context for %s", ctx->model_path.c_str());
        delete ctx;
    }
}

int whisper_full(
    struct whisper_context * ctx,
    const float * samples,
    int n_samples,
    const char * language,
    int n_threads
) {
    (void)samples;
    (void)n_samples;
    (void)language;
    (void)n_threads;
    if (!ctx || !ctx->is_loaded) {
        LOGE("whisper_full called on uninitialized context");
        return -1;
    }
    ctx->segments.clear();
    LOGE("whisper_full: STUB build — tensor runtime unavailable (return -2)");
    return -2;
}

int whisper_full_n_segments(struct whisper_context * ctx) {
    if (!ctx) return 0;
    return static_cast<int>(ctx->segments.size());
}

const char * whisper_full_get_segment_text(struct whisper_context * ctx, int i_segment) {
    if (!ctx || i_segment < 0 || i_segment >= static_cast<int>(ctx->segments.size())) {
        return "";
    }
    return ctx->segments[static_cast<size_t>(i_segment)].text.c_str();
}

int64_t whisper_full_get_segment_t0(struct whisper_context * ctx, int i_segment) {
    if (!ctx || i_segment < 0 || i_segment >= static_cast<int>(ctx->segments.size())) {
        return 0;
    }
    return ctx->segments[static_cast<size_t>(i_segment)].t0;
}

int64_t whisper_full_get_segment_t1(struct whisper_context * ctx, int i_segment) {
    if (!ctx || i_segment < 0 || i_segment >= static_cast<int>(ctx->segments.size())) {
        return 0;
    }
    return ctx->segments[static_cast<size_t>(i_segment)].t1;
}

bool whisper_has_tensor_runtime(void) {
#if defined(WHISPER_REAL_INFERENCE_READY)
    return true;
#else
    return false;
#endif
}
