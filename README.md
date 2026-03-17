# grok-voice-sred-2026

SR&ED evidence repository for the Grok/xAI real-time voice agent R&D project (March 2026).

## Project Summary

This repository captures approximately 200 hours of systematic experimental work conducted between January and March 2026, integrating xAI's Grok realtime WebSocket API (`wss://api.x.ai/v1/realtime`) into a browser-hosted AI training environment (ServeMaster Academy). The work focused on achieving sub-500ms bidirectional voice latency with reliable Voice Activity Detection (VAD) and audio delta handling — enabling realistic, conversational AI roleplay for restaurant server training.

The project was conducted entirely within Replit's cloud-hosted environment and constitutes eligible SR&ED work under the CRA's definition of technological uncertainty and systematic investigation.

## Contents

| File | Description |
|---|---|
| `SR_ED_Documentation.md` | Full SR&ED claim documentation in CRA format |
| Source code files | Captured from the Replit workspace at time of SR&ED evidence commits |

## Key Technical Areas

- **WebSocket session management** — `session.update`, VAD configuration, reconnect logic
- **Audio buffer handling** — `input_audio_buffer.append`, chunk size optimization
- **Transcription and response delta processing** — `response.audio.delta`, `response.text.delta` timing
- **Voice persona evaluation** — Eve vs. Ara across structured training scenarios
- **Latency benchmarking** — End-to-end round-trip timing across 50+ test interactions
- **Browser audio compatibility** — Web Audio API, AudioWorklet, PCM16 format across Chrome, Safari, Firefox

## SR&ED Evidence Commits

| Hash | Description |
|---|---|
| `607ef8e` | Final project state after ~200 hours |
| `546a059` | Initial full capture of the ~200-hour project |
| `5f77806` | Initial full push of voice transcription & response testing |
| `c6643fb` | Full project capture with additional core code files |

## Eligible Hours

**~200 hours** — January through March 2026

## Claimant

HerbDubee / ServeMaster Academy
kirk_adamson@servemasteracademy.ca
