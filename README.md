# grok-voice-sred-2026

SR&ED evidence repository for the Grok/xAI real-time voice agent R&D project (March 2026).

## Project Summary

This repository captures ~200 hours of systematic experimental work integrating xAI's Grok realtime WebSocket API (`wss://api.x.ai/v1/realtime`) into a browser-hosted AI training environment (ServeMaster Academy). The work focused on achieving sub-500ms bidirectional voice latency with reliable Voice Activity Detection (VAD) and audio delta handling for real-time spoken conversations between users and an AI training agent.

## Contents

- `SR_ED_Documentation.md` — Full SR&ED claim documentation (CRA format)
- Source code files from the Replit workspace at time of evidence capture

## Key Technical Areas

- **WebSocket realtime session management** — `session.update`, VAD configuration, authentication, and session persistence
- **Audio buffer handling** — `input_audio_buffer.append` chunk sizing and overflow management
- **Transcription and response delta processing** — `response.audio.delta` and `response.text.delta` timing and reconstruction
- **Voice persona evaluation** — Comparative testing of Eve and Ara voice configurations
- **Latency benchmarking** — Round-trip timing instrumentation and statistical analysis

## Eligible Hours

~200 hours (January–March 2026)

## Contact

kirk_adamson@servemasteracademy.ca
