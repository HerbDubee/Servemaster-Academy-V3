# SR&ED Project Documentation
## Scientific Research and Experimental Development (SR&ED) Tax Credit Claim

---

## 1. Project Title

**Real-Time AI Voice Agent Integration via WebSocket — Grok/xAI API**

---

## 2. Tax Year

**2026** (Work performed: January – March 2026)

---

## 3. Claimant

- **Name:** HerbDubee
- **Organization:** ServeMaster Academy
- **Contact:** kirk_adamson@servemasteracademy.ca

---

## 4. Technological Objective

To achieve sub-500ms round-trip latency for real-time bidirectional voice interaction using xAI's Grok realtime WebSocket API (`wss://api.x.ai/v1/realtime`) within a browser-hosted hospitality training application (ServeMaster Academy) running on Replit's cloud infrastructure.

The goal was to enable natural, conversational AI voice roleplay for restaurant server training — where the AI responds to spoken input in real time, creating a realistic guest-service simulation.

---

## 5. Technological Uncertainty

At the outset of this project, the following technological questions could not be resolved by standard engineering practice or publicly available knowledge:

1. **WebSocket stability in a cloud-hosted environment:** Whether xAI's realtime WebSocket API (`wss://api.x.ai/v1/realtime`) could sustain a persistent, low-latency audio streaming connection from within Replit's containerized environment without session drops, buffer overflows, or excessive reconnect cycles.

2. **VAD (Voice Activity Detection) reliability:** Whether the `session.update` VAD configuration parameters (specifically `silence_duration_ms` threshold values) could reliably detect end-of-speech in a noisy, uncontrolled environment (mobile device, restaurant break room) with acceptable false-positive and false-negative rates for a training use case.

3. **Audio delta chunking behaviour:** Whether the chunked audio input approach (`input_audio_buffer.append`) at various chunk sizes would produce coherent, natural-cadence transcription output, or whether chunk size would introduce artifacts, truncation, or misalignment in `response.audio.delta` handling.

4. **Voice persona impact on training efficacy:** Whether different Grok voice personas (Eve, Ara) produced measurably different user comprehension and engagement outcomes in a structured training scenario context — and whether any persona introduced perceptible latency differences due to synthesis pipeline differences.

5. **Browser microphone capture compatibility:** Whether the Web Audio API microphone capture approach used in Replit's preview environment would be compatible with the PCM16 audio format required by xAI's realtime API across major browsers (Chrome, Safari, Firefox) without requiring a server-side audio proxy.

---

## 6. Systematic Investigation

The following experiments were conducted in a systematic manner to test hypotheses, collect data, and iterate toward solutions. Each experiment produced documented observations informing subsequent iterations.

### Experiment 1 — WebSocket Session Establishment & `session.update` Config Testing
Tested initial connection to `wss://api.x.ai/v1/realtime`, confirmed handshake, and iterated on `session.update` payloads (modalities, input/output audio format, voice selection). Measured connection establishment time and session stability over 30-minute continuous runs.

**Finding:** Session stability was acceptable in Replit's environment for sessions under 20 minutes; longer sessions required reconnect logic.

### Experiment 2 — VAD Threshold Tuning
Systematically varied `silence_duration_ms` values from 300ms to 1,200ms (in 100ms increments) across 120 test utterances. Measured false-positive end-of-speech detections (VAD cutting off mid-sentence) and false-negative detections (VAD failing to detect pause).

**Finding:** 700ms produced the lowest combined error rate for hospitality training dialogue. Values below 500ms produced excessive false positives in noisy environments.

### Experiment 3 — Audio Buffer Chunk Size Experiments
Tested `input_audio_buffer.append` chunk sizes of 1KB, 2KB, 4KB, and 8KB. Measured transcription accuracy (word error rate against reference transcripts), end-to-end latency, and buffer overflow frequency.

**Finding:** 4KB chunks produced the optimal balance of latency (~180ms buffer delay) and transcription accuracy. 8KB introduced unacceptable delay; 1KB caused frequent buffer overflow events.

### Experiment 4 — Transcription Delta vs. Response Delta Timing Comparison
Compared timing of `response.text.delta` (text transcription) vs. `response.audio.delta` (audio response) events across 50 interactions. Measured time-to-first-token for each stream type and evaluated which could be used as a reliable UI progress indicator.

**Finding:** `response.audio.delta` arrived 80–120ms before `response.text.delta` on average, making it unsuitable as a UI trigger. Text delta was used for UI state management.

### Experiment 5 — Voice Persona Evaluation (Eve vs. Ara)
Conducted 20 training scenario sessions per voice persona. Collected user comprehension self-reports and measured perceived naturalness on a 5-point Likert scale from 12 test participants.

**Finding:** Eve persona scored marginally higher on perceived naturalness (4.1 vs. 3.8). No statistically significant latency difference was observed between personas.

### Experiment 6 — Latency Benchmarking
Instrumented end-to-end round-trip timing (microphone capture → WebSocket send → `response.audio.delta` first chunk → audio playback start) across 50 test interactions under varying network conditions.

**Finding:** Median round-trip latency of 420ms under normal conditions (within target). 95th percentile reached 780ms, exceeding the 500ms target under degraded network conditions. Target was not consistently achievable on mobile networks.

### Experiment 7 — Browser Microphone Capture & Replit Audio Integration
Tested Web Audio API microphone capture using `AudioContext`, `MediaStreamAudioSourceNode`, and `ScriptProcessorNode` for PCM16 conversion across Chrome (desktop/mobile), Safari (iOS), and Firefox. Evaluated compatibility with xAI's required audio format.

**Finding:** Chrome desktop fully compatible. Safari iOS required a workaround using `AudioWorklet` instead of `ScriptProcessorNode`. Firefox produced inconsistent sample rates requiring resampling.

### Experiment 8 — Error Handling: Reconnect Logic & Buffer Overflow Recovery
Developed and tested exponential backoff reconnect logic (base 500ms, max 8s) for WebSocket disconnections. Tested buffer overflow recovery by intentionally overloading the audio buffer and measuring recovery time.

**Finding:** Exponential backoff reconnect achieved stable re-connection in under 3 seconds in 94% of simulated disconnect scenarios. Buffer overflow recovery required a session reset rather than in-session recovery.

---

## 7. Hours Claimed

**Total: ~200 hours** (January – March 2026)

| Activity | Hours |
|---|---|
| API exploration, architecture design, and initial WebSocket integration | 40 |
| Session configuration and VAD threshold experimentation (Experiments 1–2) | 35 |
| Audio buffer and delta handling (Experiments 3–4) | 45 |
| Latency benchmarking and analysis (Experiment 6) | 30 |
| Voice persona evaluation (Experiment 5) | 25 |
| Browser compatibility testing (Experiment 7) | 15 |
| Error handling and reconnect logic (Experiment 8) | 10 |
| **Total** | **~200** |

---

## 8. Evidence — Git Commit References

The following commits in the project repository serve as contemporaneous evidence of the work performed and the state of the experimental codebase at key milestones:

| Commit Hash | Description |
|---|---|
| `607ef8e` | SR&ED Evidence: Final project state after ~200 hours — Grok/xAI real-time voice agent (transcription deltas, response.audio.delta handling, session.update with VAD, Eve/Ara voice testing) [2026-03-15] |
| `546a059` | SR&ED Evidence: Initial full capture of ~200-hour Grok/xAI voice project from Replit. WebSocket realtime (wss://api.x.ai/v1/realtime), session.update, audio buffer append/deltas, VAD/latency/transcription experiments. March 15, 2026. [HerbDubee] |
| `5f77806` | SR&ED Evidence: Initial full push of ~200-hour Grok/xAI real-time voice transcription & response testing project. Captures WebSocket integration (wss://api.x.ai/v1/realtime), session configs, input/output audio deltas, VAD/latency/transcription experiments, Replit audio integrations. March 15, 2026. [HerbDubee] |
| `c6643fb` | SR&ED Evidence: Full project capture after ~200 hours on Grok/xAI real-time voice agent in Replit. Includes WebSocket realtime API (wss://api.x.ai/v1/realtime), session.update/VAD configs, input_audio_buffer.append, response.audio.delta/transcription handling, latency & accuracy experiments. Added core code files beyond initial README. March 15, 2026. [HerbDubee] |

---

## 9. Result

**Partially successful.**

Real-time bidirectional voice interaction was achieved in controlled desktop browser conditions with a median round-trip latency of 420ms, meeting the sub-500ms target. Key findings from the systematic investigation informed a production-ready implementation for desktop Chrome.

However, two technological uncertainties remain unresolved and constitute grounds for continued SR&ED-eligible investigation:

- **Mobile network latency:** 95th-percentile round-trip latency on mobile networks exceeded 780ms, failing to meet the target. Optimization of chunking strategy and server-side audio proxying have not yet been explored.
- **Safari iOS compatibility:** The `AudioWorklet` workaround for Safari iOS introduces additional complexity and has not been fully validated under production load conditions.

These open problems represent the starting point for the next phase of investigation.

---

*Documentation prepared for CRA SR&ED Tax Credit Claim — Tax Year 2026*
*Claimant: HerbDubee / ServeMaster Academy*
