#include "whisper.h"
#include <string>
#include <vector>
#include <fstream>
#include <cmath>
#include <cstring>
#include <algorithm>
#include <sstream>
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
    std::vector<float> mel_filters;
};

static constexpr int WHISPER_SAMPLE_RATE = 16000;
static constexpr int WHISPER_N_FFT = 400;
static constexpr int WHISPER_HOP_LENGTH = 160;
static constexpr int WHISPER_CHUNK_SIZE = 30; // seconds

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
        LOGW("Model magic 0x%08x is non-standard GGML, proceeding with structural parsing...", magic);
    }

    whisper_model_hparams hp;
    file.read(reinterpret_cast<char *>(&hp), sizeof(hp));

    if (file.good() && hp.n_vocab > 0 && hp.n_vocab < 200000 && hp.n_mels > 0 && hp.n_mels <= 128) {
        ctx->hparams = hp;
        LOGI("Loaded hparams from GGML binary: n_vocab=%d, n_audio_ctx=%d, n_mels=%d, n_audio_layer=%d",
             hp.n_vocab, hp.n_audio_ctx, hp.n_mels, hp.n_audio_layer);
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
        LOGI("Applying standard Whisper hparams: n_vocab=51865, n_mels=80");
    }

    // No try/catch: CMake builds with -fno-exceptions
    ctx->vocab.reserve(static_cast<size_t>(ctx->hparams.n_vocab));
    for (int i = 0; i < ctx->hparams.n_vocab && file.good(); ++i) {
        uint32_t len = 0;
        file.read(reinterpret_cast<char *>(&len), sizeof(len));
        if (!file.good() || len > 256) {
            break;
        }
        std::string word(len, '\0');
        file.read(&word[0], static_cast<std::streamsize>(len));
        if (file.good()) {
            ctx->vocab.push_back(word);
        } else {
            break;
        }
    }
    LOGI("Read %zu tokens from model vocabulary table", ctx->vocab.size());

    ctx->is_loaded = true;
    LOGI("Successfully initialized Whisper context for: %s", path_model);
    return ctx;
}

void whisper_free(struct whisper_context * ctx) {
    if (ctx) {
        LOGI("Freeing whisper context for %s", ctx->model_path.c_str());
        delete ctx;
    }
}

static void extract_speech_activity(
    const float * samples,
    int n_samples,
    std::vector<std::pair<int, int>> & speech_intervals,
    float sample_rate = 16000.0f
) {
    const int frame_size = static_cast<int>(0.030f * sample_rate);
    const int hop_size = frame_size / 2;
    const int total_frames = n_samples / hop_size;

    if (total_frames <= 0) return;

    std::vector<float> frame_energies(static_cast<size_t>(total_frames), 0.0f);
    double total_energy = 0.0;

    for (int f = 0; f < total_frames; ++f) {
        int start = f * hop_size;
        int end = std::min(n_samples, start + frame_size);
        double sum_sq = 0.0;
        for (int i = start; i < end; ++i) {
            sum_sq += static_cast<double>(samples[i]) * static_cast<double>(samples[i]);
        }
        float rms = static_cast<float>(std::sqrt(sum_sq / std::max(1, end - start)));
        frame_energies[static_cast<size_t>(f)] = rms;
        total_energy += rms;
    }

    float avg_energy = static_cast<float>(total_energy / total_frames);
    float speech_threshold = std::max(0.015f, avg_energy * 0.6f);

    int interval_start = -1;
    int consecutive_speech = 0;
    int consecutive_silence = 0;

    for (int f = 0; f < total_frames; ++f) {
        if (frame_energies[static_cast<size_t>(f)] >= speech_threshold) {
            consecutive_speech++;
            consecutive_silence = 0;
            if (interval_start == -1 && consecutive_speech >= 3) {
                interval_start = std::max(0, f - 2);
            }
        } else {
            consecutive_silence++;
            if (interval_start != -1 && consecutive_silence >= 15) {
                int interval_end = f - 15;
                if (interval_end > interval_start + 5) {
                    int sample_start = interval_start * hop_size;
                    int sample_end = std::min(n_samples, interval_end * hop_size);
                    speech_intervals.emplace_back(sample_start, sample_end);
                }
                interval_start = -1;
                consecutive_speech = 0;
            }
        }
    }

    if (interval_start != -1) {
        int sample_start = interval_start * hop_size;
        speech_intervals.emplace_back(sample_start, n_samples);
    }

    if (speech_intervals.empty() && avg_energy >= 0.010f) {
        speech_intervals.emplace_back(0, n_samples);
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

    const float sample_rate = static_cast<float>(WHISPER_SAMPLE_RATE);
    float duration_sec = static_cast<float>(n_samples) / sample_rate;

    double sum_sq = 0.0;
    for (int i = 0; i < n_samples; ++i) {
        sum_sq += static_cast<double>(samples[i]) * static_cast<double>(samples[i]);
    }
    double overall_rms = std::sqrt(sum_sq / n_samples);

    LOGI("whisper_full: Processing %d samples (%.2f s, rms: %.4f), lang: %s, threads: %d",
         n_samples, duration_sec, overall_rms, language ? language : "auto", n_threads);

    if (overall_rms < 0.003) {
        LOGI("Audio RMS below audible speech threshold (%.4f), no segments produced", overall_rms);
        return 0;
    }

    std::vector<std::pair<int, int>> intervals;
    extract_speech_activity(samples, n_samples, intervals, sample_rate);

    if (intervals.empty()) {
        LOGI("VAD detected no speech activity in audio chunk");
        return 0;
    }

    // Fail closed: stub has no GGML tensor graph. Real builds use upstream whisper_full.
    LOGE("whisper_full: Native tensor execution runtime requires compiled GGML tensor engine. Rejecting heuristic synthesis.");
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
