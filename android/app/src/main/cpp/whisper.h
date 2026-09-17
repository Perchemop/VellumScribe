#ifndef WHISPER_H
#define WHISPER_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// Whisper context handle
struct whisper_context;

// GGML magic header values for whisper models
#define GGML_FILE_MAGIC   0x67676d6c // "ggml"
#define GGML_FILE_VERSION 1

struct whisper_model_hparams {
    int32_t n_vocab;
    int32_t n_audio_ctx;
    int32_t n_audio_state;
    int32_t n_audio_head;
    int32_t n_audio_layer;
    int32_t n_text_ctx;
    int32_t n_text_state;
    int32_t n_text_head;
    int32_t n_text_layer;
    int32_t n_mels;
    int32_t f16;
};

// Initialize whisper context from file path
struct whisper_context * whisper_init_from_file(const char * path_model);

// Free whisper context
void whisper_free(struct whisper_context * ctx);

// Process PCM 16kHz mono float array [-1.0, 1.0]
int whisper_full(
    struct whisper_context * ctx,
    const float * samples,
    int n_samples,
    const char * language,
    int n_threads
);

// Number of generated segments from the latest run
int whisper_full_n_segments(struct whisper_context * ctx);

// Text string of specified segment
const char * whisper_full_get_segment_text(struct whisper_context * ctx, int i_segment);

// Start timestamp of segment in 10ms units
int64_t whisper_full_get_segment_t0(struct whisper_context * ctx, int i_segment);

// End timestamp of segment in 10ms units
int64_t whisper_full_get_segment_t1(struct whisper_context * ctx, int i_segment);

#ifdef __cplusplus
}
#endif

#endif // WHISPER_H
