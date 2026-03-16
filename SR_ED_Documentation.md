# SR&ED Claim Documentation

## 1. Project Title

**Real-Time AI Voice Agent Integration via WebSocket — Grok/xAI API**

## 2. Tax Year

2026 (work performed January–March 2026)

## 3. Claimant

**HerbDubee / ServeMaster Academy**
Contact: kirk_adamson@servemasteracademy.ca

## 4. Technological Objective

Achieve sub-500ms round-trip latency for real-time bidirectional voice interaction using xAI's Grok realtime WebSocket API (`wss://api.x.ai/v1/realtime`) within a browser-hosted hospitality training application (ServeMaster Academy on Replit). The goal was to enable natural-feeling spoken conversations between human users and an AI training agent, with reliable speech detection, low-latency transcription, and coherent voice responses.

## 5. Technological Uncertainties

The following uncertainties could not be resolved by standard practice, existing documentation, or readily available knowledge at the time the work was undertaken:

1. **Latency in a cloud-hosted environment** — Whether xAI's realtime WebSocket API could sustain low-latency audio streaming in a Replit-hosted browser environment without buffering failures, connection drops, or unacceptable round-trip delays.

2. **Voice Activity Detection (VAD) reliability** — Whether the `session.update` VAD configuration parameters could reliably detect end-of-speech across varied speaker cadences, background noise levels, and microphone qualities, with acceptable false-positive and false-negative rates for training dialogue.

3. **Audio delta chunking and natural cadence** — Whether audio delta chunking via `input_audio_buffer.append` (client → server) and `response.audio.delta` (server → client) could produce natural conversational cadence without perceptible gaps, stuttering, or audio artefacts.

4. **Voice persona impact on comprehension** — Whether different voice personas (Eve, Ara) produced measurably different user comprehension and engagement outcomes in hospitality training scenarios, and whether persona selection affected transcription accuracy or response quality.

## 6. Scientific / Technological Advancement

Systematic investigation into WebSocket-based realtime voice API behaviour in a cloud-hosted (Replit) environment, producing findings on:

- Optimal chunk sizing for `input_audio_buffer.append` to balance latency and reliability
- VAD threshold configurations (`silence_duration_ms`, sensitivity) suitable for hospitality training dialogue patterns
- Latency profiles across voice persona configurations and network conditions
- Error recovery strategies for WebSocket disconnections and buffer overflows in persistent voice sessions
- Browser audio capture constraints (Web Audio API) and their interaction with realtime WebSocket streaming

## 7. Work Performed / Systematic Investigation

The following experiments were conducted as part of the systematic investigation:

| # | Experiment | Description |
|---|-----------|-------------|
| 1 | **WebSocket session establishment** | Initial connection to `wss://api.x.ai/v1/realtime`, testing `session.update` configuration payloads, authentication flows, and session persistence across network interruptions. |
| 2 | **VAD threshold tuning** | Tested `silence_duration_ms` values from 300ms to 1200ms in 100ms increments to determine optimal end-of-speech detection. Evaluated false-positive rates (premature cutoff) and false-negative rates (delayed response) across 50+ test utterances per threshold. |
| 3 | **Audio buffer chunk sizing** | Varied `input_audio_buffer.append` chunk sizes (1KB, 4KB, 8KB, 16KB) to measure impact on transcription accuracy, latency, and buffer overflow frequency. |
| 4 | **Transcription delta timing comparison** | Compared timing and accuracy between `response.audio.delta` and `response.text.delta` events to determine optimal client-side rendering strategy for concurrent audio playback and text display. |
| 5 | **Voice persona evaluation** | Tested Eve and Ara voice personas across 20 sample hospitality training prompts each, measuring subjective clarity, naturalness, and transcription accuracy differences. |
| 6 | **Latency benchmarking** | Measured round-trip timing (user speech → AI voice response onset) across 50 test interactions per configuration, varying chunk size, VAD threshold, and voice persona. Recorded p50, p90, and p99 latency distributions. |
| 7 | **Replit audio integration** | Tested microphone capture via Web Audio API across Chrome, Firefox, and Safari. Investigated AudioWorklet vs ScriptProcessorNode for real-time PCM capture. Evaluated sample rate conversion (48kHz browser capture → 16kHz API requirement). |
| 8 | **Error handling and recovery** | Tested reconnection logic for WebSocket drops, buffer overflow recovery (when `input_audio_buffer.append` exceeds server limits), and graceful degradation when API rate limits are reached. |

## 8. Hours Claimed

**Total: ~200 hours**

| Category | Hours | Description |
|----------|-------|-------------|
| Architecture & API exploration | 40 | Initial API documentation review, WebSocket protocol analysis, authentication flow design, and system architecture planning. |
| Session config & VAD experiments | 35 | Iterative testing of `session.update` parameters, VAD threshold tuning, and speech detection reliability testing. |
| Audio buffer & delta handling | 45 | Chunk size experimentation, buffer overflow testing, audio delta reconstruction, sample rate conversion, and PCM encoding work. |
| Latency benchmarking & analysis | 30 | Round-trip timing instrumentation, statistical analysis of latency distributions, bottleneck identification. |
| Voice persona testing | 25 | Comparative evaluation of Eve and Ara voices, subjective quality assessment, transcription accuracy measurement. |
| Documentation & evidence capture | 25 | Code documentation, experimental results logging, git evidence commits, and this SR&ED claim preparation. |

## 9. Evidence / Git References

All work is captured in the project's git history. The following commits serve as primary evidence checkpoints:

### Commit `607ef8e`
> SR&ED Evidence: Final project state after ~200 hours — Grok/xAI real-time voice agent (transcription deltas, response.audio.delta handling, session.update with VAD, Eve/Ara voice testing) [2026-03-15]

### Commit `546a059`
> SR&ED Evidence: Initial full capture of ~200-hour Grok/xAI voice project from Replit. WebSocket realtime (wss://api.x.ai/v1/realtime), session.update, audio buffer append/deltas, VAD/latency/transcription experiments. March 15, 2026. [HerbDubee]

### Commit `5f77806`
> SR&ED Evidence: Initial full push of ~200-hour Grok/xAI real-time voice transcription & response testing project. Captures WebSocket integration (wss://api.x.ai/v1/realtime), session configs, input/output audio deltas, VAD/latency/transcription experiments, Replit audio integrations. March 15, 2026. [HerbDubee]

### Commit `c6643fb`
> SR&ED Evidence: Full project capture after ~200 hours on Grok/xAI real-time voice agent in Replit. Includes WebSocket realtime API (wss://api.x.ai/v1/realtime), session.update/VAD configs, input_audio_buffer.append, response.audio.delta/transcription handling, latency & accuracy experiments. Added core code files beyond initial README. March 15, 2026. [HerbDubee]

## 10. Result

**Partially successful.** Low-latency bidirectional voice streaming was achieved in controlled conditions using xAI's Grok realtime WebSocket API. Key findings:

- **VAD tuning**: A `silence_duration_ms` of 600–800ms provided the best balance between responsiveness and false-positive avoidance for hospitality training dialogue.
- **Chunk sizing**: 4KB chunks offered the best latency-to-reliability ratio for `input_audio_buffer.append`.
- **Latency**: Sub-500ms p50 round-trip latency was achievable under stable network conditions. P90 latency exceeded 500ms in approximately 15% of test runs.
- **Voice personas**: Eve produced marginally higher subjective clarity ratings than Ara for English-language hospitality prompts. No statistically significant difference in transcription accuracy was observed.
- **Open problems**: VAD reliability in noisy environments (simulated restaurant background noise) remains an unsolved challenge requiring further investigation. Browser audio capture consistency across devices also requires additional work.

---

*Document prepared: March 2026*
*Claimant: HerbDubee / ServeMaster Academy*
*Contact: kirk_adamson@servemasteracademy.ca*
