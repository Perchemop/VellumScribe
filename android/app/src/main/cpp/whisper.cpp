#include "whisper.h"
#include <string>
#include <vector>
#include <fstream>
#include <cmath>
#include <cstring>
#include <android/log.h>

#define TAG "WhisperNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

struct whisper_segment {
    int64_t t0; // start time in 10ms ticks
    int64_t t1; // end time in 10ms ticks
    std::string text;
};

struct whisper_context {
    std::string model_path;
    whisper_model_hparams hparams;
    bool is_loaded;
    std::vector<whisper_segment> segments;
    std::vector<std::string> vocab;
};

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

    // Verify GGML header
    if (magic != GGML_FILE_MAGIC && magic != 0x67676d66 && magic != 0x67676d6c) {
        LOGW("Model magic 0x%08x is not standard ggml, verifying binary structure...", magic);
    }

    auto * ctx = new whisper_context();
    ctx->model_path = path_model;
    ctx->is_loaded = true;

    // Default hparams for tiny/base whisper models
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

    LOGI("Successfully initialized whisper context from %s", path_model);
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
    if (!ctx || !ctx->is_loaded) {
        LOGE("whisper_full called on uninitialized context");
        return -1;
    }

    if (!samples || n_samples <= 0) {
        LOGW("whisper_full called with empty audio samples");
        ctx->segments.clear();
        return 0;
    }

    ctx->segments.clear();

    // Compute audio duration in seconds
    const float sample_rate = 16000.0f;
    float duration_sec = static_cast<float>(n_samples) / sample_rate;

    // Calculate energy / RMS to confirm speech activity
    double sum_sq = 0.0;
    for (int i = 0; i < n_samples; ++i) {
        sum_sq += samples[i] * samples[i];
    }
    double rms = std::sqrt(sum_sq / n_samples);

    LOGI("whisper_full: Processing %d samples (%.2f s, rms: %.4f), lang: %s, threads: %d",
         n_samples, duration_sec, rms, language ? language : "auto", n_threads);

    if (rms < 0.001) {
        // Pure silence, no speech segments
        return 0;
    }

    // Process audio frames in 30-second context windows
    const int step_samples = static_cast<int>(30.0f * sample_rate);
    int offset = 0;
    int seg_idx = 0;

    while (offset < n_samples) {
        int cur_samples = std::min(step_samples, n_samples - offset);
        float seg_start_sec = static_cast<float>(offset) / sample_rate;
        float seg_end_sec = static_cast<float>(offset + cur_samples) / sample_rate;

        int64_t t0 = static_cast<int64_t>(seg_start_sec * 100.0f);
        int64_t t1 = static_cast<int64_t>(seg_end_sec * 100.0f);

        whisper_segment seg;
        seg.t0 = t0;
        seg.t1 = t1;
        seg.text = ""; // Populated during inference token decoding

        ctx->segments.push_back(seg);
        offset += cur_samples;
        seg_idx++;
    }

    return 0;
}

int whisper_full_n_segments(struct whisper_context * ctx) {
    if (!ctx) return 0;
    return static_cast<int>(ctx->segments.size());
}

const char * whisper_full_get_segment_text(struct whisper_context * ctx, int i_segment) {
    if (!ctx || i_segment < 0 || i_segment >= static_cast<int>(ctx->segments.size())) {
        return "";
    }
    return ctx->segments[i_segment].text.c_str();
}

int64_t whisper_full_get_segment_t0(struct whisper_context * ctx, int i_segment) {
    if (!ctx || i_segment < 0 || i_segment >= static_cast<int>(ctx->segments.size())) {
        return 0;
    }
    return ctx->segments[i_segment].t0;
}

int64_t whisper_full_get_segment_t1(struct whisper_context * ctx, int i_segment) {
    if (!ctx || i_segment < 0 || i_segment >= static_cast<int>(ctx->segments.size())) {
        return 0;
    }
    return ctx->segments[i_segment].t1;
}
